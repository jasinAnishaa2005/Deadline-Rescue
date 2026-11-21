import { describe, expect, it } from 'vitest';
import { analyzeTasks, scoreTask, summarize } from '../server/lib/urgency.js';
import { breakDownTask, generatePlan } from '../server/lib/planner.js';
import { createDemoTasks } from '../server/lib/demoData.js';
import { normalizePriority, normalizeType } from '../server/lib/taskModel.js';
import { parseNotionId, loadConfig } from '../server/config.js';

const NOW = new Date('2026-03-10T09:00:00Z');
const inHours = (h) => new Date(NOW.getTime() + h * 3600e3).toISOString();
const task = (over = {}) => ({ id: 't', title: 'Task', course: 'C', type: 'assignment', dueDate: inHours(72), completed: false, status: null, priority: 'medium', estimatedHours: 2, url: null, source: 'demo', ...over });

describe('task model', () => {
  it('normalizes type and priority', () => {
    expect(normalizeType('Midterm')).toBe('exam');
    expect(normalizeType(null, 'Quiz 3: Trees')).toBe('quiz');
    expect(normalizePriority('High 🔥')).toBe('high');
    expect(normalizePriority('low')).toBe('low');
  });
});

describe('config', () => {
  it('extracts Notion IDs from URLs and dashed IDs', () => {
    expect(parseNotionId('https://www.notion.so/me/Assignments-0123456789abcdef0123456789abcdef?v=1')).toBe('0123456789abcdef0123456789abcdef');
    expect(parseNotionId('01234567-89ab-cdef-0123-456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
    expect(parseNotionId('')).toBeUndefined();
  });
  it('treats placeholders/blank env as unset', () => {
    const cfg = loadConfig({ NOTION_TOKEN: '  ' });
    expect(cfg.notion.token).toBeFalsy();
    expect(cfg.port).toBe(3001);
  });
});

describe('urgency scoring', () => {
  it('flags overdue tasks with top scores', () => {
    const s = scoreTask(task({ dueDate: inHours(-5) }), NOW);
    expect(s.isOverdue).toBe(true);
    expect(s.level).toBe('overdue');
    expect(s.urgencyScore).toBeGreaterThanOrEqual(90);
  });
  it('scores completed tasks as zero', () => {
    expect(scoreTask(task({ completed: true }), NOW).urgencyScore).toBe(0);
  });
  it('marks work due within 24h as critical', () => {
    expect(scoreTask(task({ dueDate: inHours(10), estimatedHours: 1 }), NOW).level).toBe('critical');
  });
  it('ranks sooner, bigger work above later, smaller work', () => {
    const ranked = analyzeTasks([task({ id: 'later', dueDate: inHours(24 * 10) }), task({ id: 'done', completed: true }), task({ id: 'soon', dueDate: inHours(30), type: 'exam', estimatedHours: 8 })], NOW);
    expect(ranked.map((t) => t.id)).toEqual(['soon', 'later', 'done']);
  });
  it('summarizes dashboard stats', () => {
    const analyzed = analyzeTasks([task({ dueDate: inHours(-2) }), task({ dueDate: inHours(5) }), task({ completed: true }), task({ dueDate: inHours(24 * 20) })], NOW);
    const s = summarize(analyzed, NOW, 0);
    expect(s).toMatchObject({ total: 4, completed: 1, overdue: 1, upcoming: 1, dueToday: 1, completionRate: 25 });
    expect(s.workload).toHaveLength(14);
  });
});

describe('planner', () => {
  it('breaks large tasks into steps that sum to the effort', () => {
    const steps = breakDownTask(task({ type: 'exam', estimatedHours: 6 }));
    expect(steps.length).toBeGreaterThan(2);
    const total = steps.reduce((s, x) => s + x.minutes, 0);
    expect(Math.abs(total - 360)).toBeLessThanOrEqual(30);
  });
  it('keeps small tasks as a single step', () => {
    expect(breakDownTask(task({ estimatedHours: 0.5 }))).toHaveLength(1);
  });
  it('generates a schedule respecting daily hours and session length', () => {
    const analyzed = analyzeTasks(createDemoTasks(NOW), NOW);
    const plan = generatePlan(analyzed, { now: NOW, days: 5, hoursPerDay: 3, sessionMinutes: 45 });
    expect(plan.days).toHaveLength(5);
    for (const d of plan.days) {
      expect(d.totalMinutes).toBeLessThanOrEqual(180);
      for (const s of d.sessions) expect(s.minutes).toBeLessThanOrEqual(45);
    }
    expect(plan.recommendations).toHaveLength(3);
    expect(plan.summary.totalSessions).toBeGreaterThan(0);
    expect(plan.warnings.some((w) => w.type === 'overdue')).toBe(true);
  });
  it('never schedules completed tasks', () => {
    const analyzed = analyzeTasks([task({ id: 'a', completed: true }), task({ id: 'b' })], NOW);
    const plan = generatePlan(analyzed, { now: NOW });
    const ids = new Set(plan.days.flatMap((d) => d.sessions.map((s) => s.taskId)));
    expect(ids.has('a')).toBe(false);
    expect(ids.has('b')).toBe(true);
  });
  it('handles an empty task list', () => {
    const plan = generatePlan([], { now: NOW });
    expect(plan.summary.totalSessions).toBe(0);
    expect(plan.summary.headline).toMatch(/caught up/);
  });
});

describe('demo data', () => {
  it('contains overdue, upcoming and completed work, all tagged demo', () => {
    const analyzed = analyzeTasks(createDemoTasks(NOW), NOW);
    expect(analyzed.every((t) => t.source === 'demo')).toBe(true);
    expect(analyzed.some((t) => t.isOverdue)).toBe(true);
    expect(analyzed.some((t) => t.completed)).toBe(true);
    expect(analyzed.some((t) => t.level === 'critical')).toBe(true);
  });
});

describe('planner session length', () => {
  it('never exceeds the chosen session length (e.g. 60m task at 25m sessions)', () => {
    const analyzed = analyzeTasks([task({ id: 'x', estimatedHours: 1, dueDate: inHours(24 * 5) }), task({ id: 'y', type: 'exam', estimatedHours: 7, dueDate: inHours(24 * 6) })], NOW);
    const plan = generatePlan(analyzed, { now: NOW, days: 3, hoursPerDay: 4, startHour: 12, sessionMinutes: 25 });
    const sessions = plan.days.flatMap((d) => d.sessions);
    expect(sessions.length).toBeGreaterThan(0);
    for (const s of sessions) expect(s.minutes).toBeLessThanOrEqual(25);
  });
});
