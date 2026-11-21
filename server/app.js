import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { loadConfig } from './config.js';
import { createNotionService, NotionServiceError, toServiceError } from './lib/notion.js';
import { getDemoTasks, resetDemoTasks, setDemoTaskCompleted } from './lib/demoData.js';
import { analyzeTasks, summarize } from './lib/urgency.js';
import { generatePlan } from './lib/planner.js';
import { getAiPlanAdvice } from './lib/ai.js';

const tzFrom = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= 14 * 60 ? n : 0;
};

const sourceFrom = (v) => (v === 'notion' ? 'notion' : 'demo');

export function createApp({ config = loadConfig(), notionService, fetchImpl } = {}) {
  const notion = notionService || createNotionService(config.notion);
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '300kb' }));
  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));

  async function loadTasks(source, tzOffsetMinutes) {
    if (source === 'notion') {
      const result = await notion.fetchTasks({ tzOffsetMinutes });
      return { ...result, source: 'notion' };
    }
    return { tasks: getDemoTasks(), source: 'demo', database: null, schema: null };
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/status', (_req, res) => {
    res.json({
      notion: {
        configured: notion.configured,
        databaseConfigured: Boolean(config.notion.tasksDatabaseId),
        plansParentConfigured: Boolean(config.notion.plansParentPageId),
      },
      ai: { configured: Boolean(config.ai.apiKey), model: config.ai.apiKey ? config.ai.model : null },
    });
  });

  app.get('/api/notion/connection', async (_req, res, next) => {
    try {
      const ds = await notion.resolveDataSource();
      res.json({ connected: true, database: { id: ds.id, title: ds.title, url: ds.url }, schema: ds.schema });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/notion/databases', async (_req, res, next) => {
    try {
      res.json({ databases: await notion.listDataSources() });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/tasks', async (req, res, next) => {
    try {
      const tz = tzFrom(req.query.tz);
      const now = new Date();
      const { tasks, source, database, schema } = await loadTasks(sourceFrom(req.query.source), tz);
      const analyzed = analyzeTasks(tasks, now);
      res.json({ source, fetchedAt: now.toISOString(), database, schema, tasks: analyzed, stats: summarize(analyzed, now, tz) });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/tasks/:id', async (req, res, next) => {
    try {
      const completed = req.body?.completed === true;
      if (sourceFrom(req.body?.source) === 'notion') {
        await notion.setTaskCompleted(req.params.id, completed);
      } else if (!setDemoTaskCompleted(req.params.id, completed)) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json({ ok: true, id: req.params.id, completed });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/demo/reset', (_req, res) => {
    resetDemoTasks();
    res.json({ ok: true });
  });

  app.post('/api/plan', async (req, res, next) => {
    try {
      const body = req.body || {};
      const tz = tzFrom(body.tzOffsetMinutes);
      const now = new Date();
      const { tasks, source } = await loadTasks(sourceFrom(body.source), tz);
      const analyzed = analyzeTasks(tasks, now);

      let advice = null;
      let aiError = null;
      if (body.useAi !== false && config.ai.apiKey) {
        try {
          advice = await getAiPlanAdvice(analyzed.filter((t) => !t.completed), config.ai, fetchImpl ? { fetchImpl } : undefined);
        } catch (err) {
          aiError = 'AI enhancement unavailable — used the built-in planner instead.';
          console.warn('[planner] LLM fallback:', err.message);
        }
      }

      const plan = generatePlan(analyzed, {
        days: body.days,
        hoursPerDay: body.hoursPerDay,
        startHour: body.startHour,
        endHour: body.endHour,
        sessionMinutes: body.sessionMinutes,
        breakMinutes: body.breakMinutes,
        tzOffsetMinutes: tz,
        now,
        customSteps: advice?.steps,
      });
      if (advice) {
        plan.engine = 'llm';
        plan.model = config.ai.model;
        plan.tips = advice.tips;
      }
      if (aiError) plan.notice = aiError;
      plan.source = source;
      res.json(plan);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/plan/save', async (req, res, next) => {
    try {
      const plan = req.body?.plan;
      if (!plan || !Array.isArray(plan.days)) return res.status(400).json({ error: 'A generated plan is required.' });
      if (plan.source !== 'notion') {
        return res.status(400).json({ error: 'This plan was built from demo data. Switch to Notion data to save plans to your workspace.' });
      }
      const page = await notion.savePlan(plan);
      res.json({ ok: true, page });
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const e = err instanceof NotionServiceError ? err : err?.code ? toServiceError(err) : err;
    const status = e.status || e.statusCode || 500;
    if (status >= 500) console.error('[api]', err);
    res.status(status).json({ error: status >= 500 && !(e instanceof NotionServiceError) ? 'Internal server error' : e.message, code: e.code });
  });

  return app;
}
