import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { resetDemoTasks } from '../server/lib/demoData.js';

const noNotion = () => createApp({ config: loadConfig({}) });

describe('API (demo mode, no credentials)', () => {
  beforeEach(() => resetDemoTasks());

  it('reports status without leaking secrets', async () => {
    const res = await request(createApp({ config: loadConfig({ NOTION_TOKEN: 'secret_abc', OPENAI_API_KEY: 'sk-xyz' }) })).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.notion.configured).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/secret_abc|sk-xyz/);
  });

  it('returns analyzed demo tasks and stats', async () => {
    const res = await request(noNotion()).get('/api/tasks?source=demo&tz=-360');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('demo');
    expect(res.body.tasks.length).toBeGreaterThan(10);
    expect(res.body.tasks.every((t) => t.source === 'demo')).toBe(true);
    expect(res.body.stats.overdue).toBeGreaterThan(0);
  });

  it('returns a clear error for Notion when not configured', async () => {
    const res = await request(noNotion()).get('/api/tasks?source=notion');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('not_configured');
  });

  it('toggles demo task completion', async () => {
    const app = noNotion();
    const res = await request(app).patch('/api/tasks/demo-1').send({ completed: true, source: 'demo' });
    expect(res.body.ok).toBe(true);
    const tasks = await request(app).get('/api/tasks?source=demo');
    expect(tasks.body.tasks.find((t) => t.id === 'demo-1').completed).toBe(true);
    expect((await request(app).patch('/api/tasks/nope').send({ completed: true })).status).toBe(404);
  });

  it('generates a plan from demo data', async () => {
    const res = await request(noNotion()).post('/api/plan').send({ source: 'demo', days: 3, hoursPerDay: 4 });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('demo');
    expect(res.body.engine).toBe('heuristic');
    expect(res.body.days).toHaveLength(3);
  });

  it('refuses to save demo plans to Notion', async () => {
    const res = await request(noNotion()).post('/api/plan/save').send({ plan: { source: 'demo', days: [] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/demo data/);
  });

  it('saves Notion plans through the Notion service', async () => {
    const notionService = { configured: true, savePlan: vi.fn().mockResolvedValue({ id: 'p', url: 'https://notion.so/p' }) };
    const res = await request(createApp({ config: loadConfig({}), notionService })).post('/api/plan/save').send({ plan: { source: 'notion', days: [] } });
    expect(res.status).toBe(200);
    expect(res.body.page.url).toBe('https://notion.so/p');
  });

  it('uses LLM advice when configured and falls back on failure', async () => {
    const config = loadConfig({ OPENAI_API_KEY: 'sk-test' });
    const bad = vi.fn().mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await request(createApp({ config, fetchImpl: bad })).post('/api/plan').send({ source: 'demo' });
    expect(res.status).toBe(200);
    expect(res.body.engine).toBe('heuristic');
    expect(res.body.notice).toMatch(/built-in planner/);
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(noNotion()).get('/api/nope');
    expect(res.status).toBe(404);
  });
});
