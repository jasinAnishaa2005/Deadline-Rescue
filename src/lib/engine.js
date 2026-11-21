import { analyzeTasks, summarize } from '../../server/lib/urgency.js';
import { generatePlan } from '../../server/lib/planner.js';

/** Runs the shared urgency engine in the browser, returning the same shape as GET /api/tasks. */
export function buildData(tasks, source, now = new Date(), tzOffsetMinutes = now.getTimezoneOffset()) {
  const analyzed = analyzeTasks(tasks, now);
  return { source, fetchedAt: now.toISOString(), database: null, schema: null, tasks: analyzed, stats: summarize(analyzed, now, tzOffsetMinutes) };
}

/** Runs the shared planner engine in the browser, returning the same shape as POST /api/plan. */
export function buildPlan(tasks, source, settings = {}, now = new Date(), tzOffsetMinutes = now.getTimezoneOffset()) {
  const plan = generatePlan(analyzeTasks(tasks, now), { ...settings, tzOffsetMinutes, now });
  plan.source = source;
  return plan;
}
