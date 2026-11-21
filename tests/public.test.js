import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { loadConfig, resolveMode } from '../server/config.js';
import { sanitizeTask } from '../server/lib/taskModel.js';

const OWNER = { NOTION_TOKEN: 'secret_owner_token', OPENAI_API_KEY: 'sk-owner' };
const fakeNotion = () => ({
  configured: true,
  fetchTasks: vi.fn().mockResolvedValue({ tasks: [{ id: 'n1', title: 'Owner task', type: 'quiz', source: 'notion' }] }),
  resolveDataSource: vi.fn().mockResolvedValue({ id: 'db', title: 'Owner DB', schema: {} }),
  listDataSources: vi.fn().mockResolvedValue([]),
  setTaskCompleted: vi.fn(),
  savePlan: vi.fn(),
});

describe('deployment mode', () => {
  it('defaults to public in production and personal in development', () => {
    expect(resolveMode({ NODE_ENV: 'production' })).toBe('public');
    expect(resolveMode({})).toBe('personal');
    expect(resolveMode({ NODE_ENV: 'production', APP_MODE: 'Personal' })).toBe('personal');
    expect(resolveMode({ APP_MODE: 'public' })).toBe('public');
    expect(resolveMode({ NODE_ENV: 'production', APP_MODE: 'typo' })).toBe('public');
  });

  it('never loads the owner token in public mode, and gates the AI key', () => {
    const pub = loadConfig({ ...OWNER, APP_MODE: 'public' });
    expect(pub.notion.token).toBeUndefined();
    expect(pub.ignoredNotionToken).toBe(true);
    expect(pub.ai.apiKey).toBeUndefined();
    expect(loadConfig({ ...OWNER, APP_MODE: 'public', PUBLIC_AI_ENABLED: 'true' }).ai.apiKey).toBe('sk-owner');
    expect(loadConfig({ ...OWNER, APP_MODE: 'personal' }).notion.token).toBe('secret_owner_token');
  });

  it('parses TRUST_PROXY', () => {
    expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(loadConfig({ TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadConfig({}).trustProxy).toBeUndefined();
  });
});

describe('API in public mode', () => {
  const publicApp = (notionService = fakeNotion()) => ({ app: createApp({ config: loadConfig({ ...OWNER, APP_MODE: 'public' }), notionService }), notionService });

  it('reports public mode with Notion unavailable and no secrets', async () => {
    const res = await request(publicApp().app).get('/api/status');
    expect(res.body.mode).toBe('public');
    expect(res.body.publicMode).toBe(true);
    expect(res.body.notion.configured).toBe(false);
    expect(res.body.ai.configured).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/secret_owner_token|sk-owner/);
  });

  it('blocks every Notion route without touching the Notion service', async () => {
    const { app, notionService } = publicApp();
    const calls = [
      request(app).get('/api/notion/connection'),
      request(app).get('/api/notion/databases'),
      request(app).get('/api/tasks?source=notion'),
      request(app).patch('/api/tasks/n1').send({ completed: true, source: 'notion' }),
      request(app).post('/api/plan').send({ source: 'notion' }),
      request(app).post('/api/plan/save').send({ plan: { source: 'notion', days: [] } }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('public_mode');
      expect(JSON.stringify(res.body)).not.toMatch(/Owner/);
    }
    for (const fn of Object.values(notionService)) if (typeof fn === 'function') expect(fn).not.toHaveBeenCalled();
  });

  it('keeps shared demo data read-only', async () => {
    const { app } = publicApp();
    expect((await request(app).get('/api/tasks?source=demo')).status).toBe(200);
    expect((await request(app).patch('/api/tasks/demo-1').send({ completed: true, source: 'demo' })).status).toBe(403);
    expect((await request(app).post('/api/demo/reset')).status).toBe(403);
  });

  it('plans browser-supplied tasks without storing them', async () => {
    const { app } = publicApp();
    const due = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    const tasks = [
      { id: 'a', title: 'Essay draft', course: 'ENG 101', type: 'assignment', dueDate: due, priority: 'high', estimatedHours: 3 },
      { title: '   ' },
      { id: 'b', title: '<b>Quiz</b>', type: 'weird', dueDate: 'not a date', estimatedHours: -4, extra: 'dropped' },
    ];
    const res = await request(app).post('/api/plan').send({ source: 'client', tasks, days: 3, hoursPerDay: 2 });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('client');
    expect(res.body.summary.openTasks).toBe(2);
    expect(res.body.breakdown.map((b) => b.title)).toEqual(expect.arrayContaining(['Essay draft', '<b>Quiz</b>']));
    expect(JSON.stringify(res.body)).not.toMatch(/dropped/);
    // A second visitor's plan does not see the first visitor's tasks.
    const other = await request(app).post('/api/plan').send({ source: 'client', tasks: [] });
    expect(other.body.summary.openTasks).toBe(0);
  });

  it('validates browser-supplied task lists', async () => {
    const { app } = publicApp();
    expect((await request(app).post('/api/plan').send({ source: 'client', tasks: 'nope' })).status).toBe(400);
    const many = Array.from({ length: 201 }, (_, i) => ({ title: `T${i}` }));
    expect((await request(app).post('/api/plan').send({ source: 'client', tasks: many })).status).toBe(400);
    expect((await request(app).get('/api/tasks?source=client')).status).toBe(400);
  });
});

describe('API in personal mode keeps Notion working', () => {
  it('still reads Notion tasks with the owner token', async () => {
    const notionService = fakeNotion();
    const app = createApp({ config: loadConfig({ ...OWNER, APP_MODE: 'personal' }), notionService });
    const res = await request(app).get('/api/tasks?source=notion');
    expect(res.status).toBe(200);
    expect(res.body.tasks[0].title).toBe('Owner task');
    expect((await request(app).get('/api/status')).body.notion.configured).toBe(true);
  });
});

describe('sanitizeTask', () => {
  it('normalizes and bounds user input', () => {
    const t = sanitizeTask({ title: '  Lab 2  ', course: 'x'.repeat(500), type: 'lab', priority: 'urgent', estimatedHours: 999, dueDate: '2026-12-01T10:00:00Z', completed: 'yes' });
    expect(t).toMatchObject({ title: 'Lab 2', type: 'lab', priority: null, estimatedHours: 200, dueDate: '2026-12-01T10:00:00.000Z', completed: false, source: 'local', url: null });
    expect(t.course).toHaveLength(120);
    expect(sanitizeTask({ title: 'Midterm prep', type: 'Exam!' }).type).toBe('exam');
    expect(sanitizeTask({ title: '' })).toBeNull();
    expect(sanitizeTask(null)).toBeNull();
  });
});
