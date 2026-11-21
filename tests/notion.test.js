import { describe, expect, it, vi } from 'vitest';
import { createNotionService, detectSchema, mapPageToTask, planToBlocks, toDueDate } from '../server/lib/notion.js';

// Shapes follow the official Notion API (2025-09-03 data sources).
const PROPS = {
  Name: { id: 'a', type: 'title', title: {} },
  'Due Date': { id: 'b', type: 'date', date: {} },
  Status: {
    id: 'c', type: 'status',
    status: {
      options: [{ id: 's1', name: 'Not started' }, { id: 's2', name: 'In progress' }, { id: 's3', name: 'Submitted' }],
      groups: [{ name: 'To-do', option_ids: ['s1'] }, { name: 'In progress', option_ids: ['s2'] }, { name: 'Complete', option_ids: ['s3'] }],
    },
  },
  Course: { id: 'd', type: 'relation', relation: {} },
  Type: { id: 'e', type: 'select', select: { options: [] } },
  Priority: { id: 'f', type: 'select', select: { options: [] } },
  'Est. Hours': { id: 'g', type: 'number', number: {} },
  Notes: { id: 'h', type: 'rich_text', rich_text: {} },
};

const page = (over = {}) => ({
  object: 'page',
  id: 'page-1',
  url: 'https://www.notion.so/page-1',
  properties: {
    Name: { type: 'title', title: [{ plain_text: 'Essay on Kant' }] },
    'Due Date': { type: 'date', date: { start: '2026-03-12' } },
    Status: { type: 'status', status: { name: 'Submitted' } },
    Course: { type: 'relation', relation: [{ id: 'course-1' }] },
    Type: { type: 'select', select: { name: 'Assignment' } },
    Priority: { type: 'select', select: { name: 'High' } },
    'Est. Hours': { type: 'number', number: 5 },
    ...over,
  },
});

describe('schema detection', () => {
  it('detects Student OS style properties', () => {
    const s = detectSchema(PROPS);
    expect(s.title.name).toBe('Name');
    expect(s.due.name).toBe('Due Date');
    expect(s.status).toEqual({ name: 'Status', type: 'status' });
    expect(s.course.name).toBe('Course');
    expect(s.type.name).toBe('Type');
    expect(s.priority.name).toBe('Priority');
    expect(s.effort.name).toBe('Est. Hours');
  });
  it('honours explicit property overrides', () => {
    const props = { ...PROPS, Deadline: { type: 'date', date: {} } };
    expect(detectSchema(props, { due: 'Deadline' }).due.name).toBe('Deadline');
  });
  it('falls back to a checkbox for completion', () => {
    const s = detectSchema({ Task: { type: 'title' }, When: { type: 'date' }, Done: { type: 'checkbox' } });
    expect(s.status).toEqual({ name: 'Done', type: 'checkbox' });
  });
});

describe('page mapping', () => {
  it('maps a Notion page to a normalized task', () => {
    const schema = detectSchema(PROPS);
    const t = mapPageToTask(page(), schema, PROPS, { relationNames: new Map([['course-1', 'PHIL 150']]) });
    expect(t).toMatchObject({
      id: 'page-1', title: 'Essay on Kant', course: 'PHIL 150', type: 'assignment',
      completed: true, status: 'Submitted', priority: 'high', estimatedHours: 5, source: 'notion',
    });
    expect(t.dueDate).toBe('2026-03-12T23:59:00.000Z');
  });
  it('treats status groups other than Complete as open', () => {
    const t = mapPageToTask(page({ Status: { type: 'status', status: { name: 'In progress' } } }), detectSchema(PROPS), PROPS);
    expect(t.completed).toBe(false);
  });
  it('converts date-only values to end of the local day', () => {
    expect(toDueDate('2026-03-12', -360)).toBe('2026-03-12T17:59:00.000Z');
    expect(toDueDate('2026-03-12T10:00:00.000+00:00')).toBe('2026-03-12T10:00:00.000Z');
    expect(toDueDate(null)).toBeNull();
  });
});

function fakeClient() {
  return {
    search: vi.fn().mockResolvedValue({ results: [{ id: 'ds-1', object: 'data_source', title: [{ plain_text: 'Assignments' }], parent: { database_id: 'db-1' } }, { id: 'ds-2', title: [{ plain_text: 'Reading list' }] }] }),
    dataSources: {
      retrieve: vi.fn().mockResolvedValue({ id: 'ds-1', title: [{ plain_text: 'Assignments' }], parent: { database_id: 'db-1' }, url: 'https://notion.so/ds', properties: PROPS }),
      query: vi.fn().mockResolvedValueOnce({ results: [page()], has_more: true, next_cursor: 'c2' }).mockResolvedValueOnce({ results: [page({ Name: { type: 'title', title: [{ plain_text: 'Quiz 2' }] }, Status: { type: 'status', status: { name: 'Not started' } } })], has_more: false }),
    },
    databases: { retrieve: vi.fn().mockResolvedValue({ id: 'db-1', parent: { type: 'page_id', page_id: 'student-os' } }) },
    pages: {
      retrieve: vi.fn().mockImplementation(async ({ page_id }) =>
        page_id === 'course-1'
          ? { properties: { Name: { type: 'title', title: [{ plain_text: 'PHIL 150' }] } } }
          : { id: page_id, parent: { type: 'data_source_id', data_source_id: page_id === 'page-1' ? 'ds-1' : 'other-ds', database_id: page_id === 'page-1' ? 'db-1' : 'other-db' } },
      ),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: 'plan-page', url: 'https://notion.so/plan-page' }),
    },
    blocks: { children: { append: vi.fn().mockResolvedValue({}) } },
  };
}

describe('notion service (mocked official client)', () => {
  it('auto-detects the assignments data source and paginates tasks', async () => {
    const client = fakeClient();
    const svc = createNotionService({ token: 'x', propertyOverrides: {} }, { client });
    const { tasks, database } = await svc.fetchTasks();
    expect(database.title).toBe('Assignments');
    expect(client.dataSources.retrieve).toHaveBeenCalledWith({ data_source_id: 'ds-1' });
    expect(client.dataSources.query).toHaveBeenCalledTimes(2);
    expect(tasks.map((t) => t.title)).toEqual(['Essay on Kant', 'Quiz 2']);
    expect(tasks[0].course).toBe('PHIL 150');
  });
  it('marks tasks complete using the Complete status group', async () => {
    const client = fakeClient();
    const svc = createNotionService({ token: 'x', propertyOverrides: {} }, { client });
    await svc.setTaskCompleted('page-1', true);
    expect(client.pages.update).toHaveBeenCalledWith({ page_id: 'page-1', properties: { Status: { status: { name: 'Submitted' } } } });
    await svc.setTaskCompleted('page-1', false);
    expect(client.pages.update).toHaveBeenLastCalledWith({ page_id: 'page-1', properties: { Status: { status: { name: 'In progress' } } } });
  });
  it('refuses to update pages outside the assignments database', async () => {
    const client = fakeClient();
    const svc = createNotionService({ token: 'x', propertyOverrides: {} }, { client });
    await expect(svc.setTaskCompleted('some-other-page', true)).rejects.toMatchObject({ status: 403 });
    expect(client.pages.update).not.toHaveBeenCalled();
  });
  it('saves a plan as a child page of the database parent', async () => {
    const client = fakeClient();
    const svc = createNotionService({ token: 'x', propertyOverrides: {} }, { client });
    const plan = { generatedAt: '2026-03-10T09:00:00Z', summary: { headline: 'Go', totalSessions: 1, totalHours: 1 }, recommendations: [], warnings: [], days: [{ date: '2026-03-10', totalMinutes: 50, sessions: [{ start: '09:00', end: '09:50', title: 'Essay', step: 'Outline', minutes: 50 }] }] };
    const res = await svc.savePlan(plan);
    expect(res).toEqual({ id: 'plan-page', url: 'https://notion.so/plan-page' });
    const arg = client.pages.create.mock.calls[0][0];
    expect(arg.parent).toEqual({ page_id: 'student-os' });
    expect(arg.properties.title.title[0].text.content).toMatch(/Study Plan — 2026-03-10/);
  });
  it('maps Notion API errors to friendly messages', async () => {
    const client = fakeClient();
    client.search.mockRejectedValue(Object.assign(new Error('API token is invalid.'), { code: 'unauthorized' }));
    const svc = createNotionService({ token: 'x', propertyOverrides: {} }, { client });
    await expect(svc.fetchTasks()).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
  });
  it('refuses to work without a token', async () => {
    const svc = createNotionService({ propertyOverrides: {} });
    expect(svc.configured).toBe(false);
    await expect(svc.fetchTasks()).rejects.toMatchObject({ code: 'not_configured' });
  });
  it('chunks long plans into ≤100-block requests', () => {
    const days = Array.from({ length: 14 }, (_, i) => ({ date: `2026-03-${String(i + 1).padStart(2, '0')}`, totalMinutes: 600, sessions: Array.from({ length: 10 }, () => ({ start: '09:00', end: '09:50', title: 'T', step: 'S', minutes: 50 })) }));
    expect(planToBlocks({ summary: {}, days }).length).toBeGreaterThan(100);
  });
});

describe('done-label detection', () => {
  it('does not treat negated labels as complete', async () => {
    const { isDoneLabel } = await import('../server/lib/taskModel.js');
    for (const l of ['Done', 'Submitted', 'Completed', 'Turned in', 'Unit 1 Complete']) expect(isDoneLabel(l)).toBe(true);
    for (const l of ['Not Done', 'Not Submitted', 'Incomplete', 'Unfinished', 'To Do', 'Unclosed', 'Un-submitted']) expect(isDoneLabel(l)).toBe(false);
  });
});

describe('schema detection edge cases', () => {
  it('prefers a Due Date formula over an unrelated Assigned Date', () => {
    const s = detectSchema({ Name: { type: 'title' }, 'Assigned Date': { type: 'date' }, 'Due Date': { type: 'formula' } });
    expect(s.due.name).toBe('Due Date');
  });
  it('ignores an Overdue formula when a Due Date exists', () => {
    const s = detectSchema({ Name: { type: 'title' }, Overdue: { type: 'formula' }, 'Due Date': { type: 'date' } });
    expect(s.due.name).toBe('Due Date');
  });
  it('finds compact deadline names and prefers the effective deadline', () => {
    expect(detectSchema({ Name: { type: 'title' }, DueDate: { type: 'formula' }, Created: { type: 'date' } }).due.name).toBe('DueDate');
    expect(detectSchema({ Name: { type: 'title' }, due_date: { type: 'formula' } }).due.name).toBe('due_date');
    expect(detectSchema({ Name: { type: 'title' }, 'Original Due Date': { type: 'date' }, 'Due Date': { type: 'formula' } }).due.name).toBe('Due Date');
  });
  it('skips countdown formulas and accepts plural deadline names', () => {
    expect(detectSchema({ Name: { type: 'title' }, 'Days Until Due': { type: 'formula' }, 'Original Due Date': { type: 'date' } }).due.name).toBe('Original Due Date');
    expect(detectSchema({ Name: { type: 'title' }, 'Assigned Date': { type: 'date' }, Deadlines: { type: 'formula' } }).due.name).toBe('Deadlines');
  });
  it('trusts date fields over flag-like formulas', () => {
    expect(detectSchema({ Name: { type: 'title' }, 'Due Day': { type: 'date' }, 'Original Due Date': { type: 'date' } }).due.name).toBe('Due Day');
    expect(detectSchema({ Name: { type: 'title' }, 'Deadlines Met': { type: 'formula' }, 'Hand-in Date': { type: 'date' } }).due.name).toBe('Hand-in Date');
  });
  it('does not use an unrelated checkbox as completion status', () => {
    const s = detectSchema({ Name: { type: 'title' }, Due: { type: 'date' }, Flagged: { type: 'checkbox' } });
    expect(s.status).toBeNull();
  });
});
