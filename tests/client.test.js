import { describe, expect, it } from 'vitest';
import { buildData, buildPlan } from '../src/lib/engine.js';
import { planFileName, planToIcs, planToMarkdown } from '../src/lib/exportPlan.js';
import {
  cleanTasks,
  exportTasksJson,
  fromDateTimeInput,
  loadPrefs,
  loadTasks,
  MAX_TASKS,
  parseTasksImport,
  savePrefs,
  saveTasks,
  taskFromForm,
  TASKS_KEY,
  toDateTimeInput,
} from '../src/lib/localStore.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)), data };
}

const NOW = new Date('2026-11-21T18:30:00Z'); // 00:30 in Dhaka
const DHAKA = -360;
const inHours = (h) => new Date(NOW.getTime() + h * 3600 * 1000).toISOString();

describe('local browser storage', () => {
  it('round-trips tasks and keeps visitors isolated per storage', () => {
    const a = memoryStorage();
    const b = memoryStorage();
    const { task } = taskFromForm({ title: 'Essay', course: 'ENG', type: 'assignment', priority: 'high', deadline: '', estimatedHours: '3' });
    expect(saveTasks([task], a)).toBe(true);
    expect(loadTasks(a)).toEqual([task]);
    expect(loadTasks(b)).toEqual([]);
  });

  it('survives corrupt or tampered storage', () => {
    expect(loadTasks(memoryStorage({ [TASKS_KEY]: '{broken' }))).toEqual([]);
    const tampered = memoryStorage({ [TASKS_KEY]: JSON.stringify({ tasks: [{ id: 'x', title: 'ok', url: 'javascript:alert(1)' }, { title: '' }, 5] }) });
    const tasks = loadTasks(tampered);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].url).toBeNull();
    expect(loadTasks(null)).toEqual([]);
    expect(saveTasks([], { setItem: () => { throw new Error('quota'); } })).toBe(false);
  });

  it('dedupes ids and caps the list', () => {
    const tasks = cleanTasks([{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }]);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(2);
    expect(cleanTasks(Array.from({ length: MAX_TASKS + 5 }, (_, i) => ({ title: `T${i}` })))).toHaveLength(MAX_TASKS);
  });

  it('stores preferences', () => {
    const s = memoryStorage();
    expect(loadPrefs(s)).toEqual({});
    savePrefs({ planner: { days: 5 } }, s);
    expect(loadPrefs(s).planner.days).toBe(5);
  });

  it('validates the assignment form', () => {
    expect(taskFromForm({ title: '  ' }).error).toMatch(/name/);
    expect(taskFromForm({ title: 'X', estimatedHours: '-1' }).error).toMatch(/positive/);
    const { task } = taskFromForm({ title: 'Quiz', type: 'quiz', priority: 'low', deadline: '2026-11-25T09:30', estimatedHours: '' });
    expect(task).toMatchObject({ title: 'Quiz', type: 'quiz', priority: 'low', estimatedHours: null, completed: false, source: 'local' });
    expect(task.id).toMatch(/^local-/);
    expect(toDateTimeInput(task.dueDate)).toBe('2026-11-25T09:30');
    const edited = taskFromForm({ title: 'Quiz 2', type: 'quiz', deadline: '' }, { ...task, completed: true }).task;
    expect(edited).toMatchObject({ id: task.id, title: 'Quiz 2', completed: true, dueDate: null });
    expect(fromDateTimeInput('')).toBeNull();
  });

  it('exports and imports JSON backups', () => {
    const tasks = cleanTasks([{ title: 'A', type: 'exam' }]);
    expect(parseTasksImport(exportTasksJson(tasks))).toEqual(tasks);
    expect(parseTasksImport(JSON.stringify([{ title: 'Bare array' }]))[0].title).toBe('Bare array');
    expect(() => parseTasksImport('nope')).toThrow(/valid JSON/);
    expect(() => parseTasksImport('{"x":1}')).toThrow(/No assignments/);
    expect(() => parseTasksImport('[{"title":""}]')).toThrow(/No valid/);
  });
});

describe('in-browser engine', () => {
  const tasks = [
    { id: 'l1', title: 'DSA Quiz 3', course: 'Data Structures', type: 'quiz', dueDate: inHours(30), priority: 'high', estimatedHours: 2, completed: false, source: 'local' },
    { id: 'l2', title: 'Old lab', type: 'lab', dueDate: inHours(-5), completed: false, source: 'local' },
    { id: 'l3', title: 'Done essay', type: 'assignment', dueDate: inHours(-50), completed: true, source: 'local' },
  ];

  it('builds dashboard data like the API', () => {
    const data = buildData(tasks, 'local', NOW, DHAKA);
    expect(data.source).toBe('local');
    expect(data.stats).toMatchObject({ total: 3, completed: 1, overdue: 1 });
    expect(data.tasks[0].id).toBe('l2');
  });

  it('generates and exports a personalized plan', () => {
    const plan = buildPlan(tasks, 'local', { days: 3, hoursPerDay: 2, startHour: 9 }, NOW, DHAKA);
    expect(plan.source).toBe('local');
    expect(plan.summary.totalSessions).toBeGreaterThan(0);
    expect(planFileName(plan, 'md')).toBe('deadline-rescue-plan-2026-11-22.md');

    const md = planToMarkdown(plan);
    expect(md).toMatch(/^# Deadline Rescue Study Plan — 2026-11-22/);
    expect(md).toContain('## Schedule');
    expect(md).toContain('### Sunday, Nov 22');
    expect(md).toMatch(/- \[ \] 09:00–\d\d:\d\d · .+ — /);
    expect(md).toContain('DSA Quiz 3');

    const ics = planToIcs(plan);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(plan.summary.totalSessions);
    expect(ics).toContain('DTSTART:20261122T030000Z'); // 09:00 Dhaka
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it('escapes calendar text', () => {
    const plan = buildPlan([{ id: 'x', title: 'Read; chapter, 1\\2', type: 'reading', dueDate: inHours(48), estimatedHours: 0.5 }], 'local', { days: 2 }, NOW, DHAKA);
    expect(planToIcs(plan)).toContain('Read\\; chapter\\, 1\\\\2');
  });
});
