import { effortFor } from './taskModel.js';

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;

export const STEP_TEMPLATES = {
  exam: [
    ['Map the syllabus & gather notes', 0.1],
    ['Review core concepts', 0.3],
    ['Practice problems & past papers', 0.35],
    ['Drill weak areas', 0.15],
    ['Final recap with flashcards', 0.1],
  ],
  project: [
    ['Clarify requirements & scope', 0.1],
    ['Plan & outline the deliverable', 0.15],
    ['Build the core deliverable', 0.45],
    ['Test, polish & document', 0.2],
    ['Final review & submit', 0.1],
  ],
  assignment: [
    ['Read the brief & rubric', 0.1],
    ['Work through the main questions', 0.45],
    ['Write up / draft answers', 0.3],
    ['Review & submit', 0.15],
  ],
  quiz: [
    ['Review lecture notes', 0.4],
    ['Practice questions', 0.45],
    ['Quick recap', 0.15],
  ],
  lab: [
    ['Review procedure & raw data', 0.2],
    ['Analyze results', 0.4],
    ['Write the report', 0.3],
    ['Proofread & submit', 0.1],
  ],
  reading: [
    ['Skim & preview', 0.2],
    ['Active reading with notes', 0.6],
    ['Summarize key points', 0.2],
  ],
  other: [
    ['Plan the work', 0.2],
    ['Do the work', 0.65],
    ['Review', 0.15],
  ],
};

const roundTo5 = (n) => Math.max(5, Math.round(n / 5) * 5);
const pad = (n) => String(n).padStart(2, '0');
const toClock = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

function remainingMinutes(task) {
  const hours = effortFor(task);
  const inProgress = /progress|doing|started|working/i.test(task.status || '') && !/not started/i.test(task.status || '');
  return roundTo5(hours * 60 * (inProgress ? 0.75 : 1));
}

/** Breaks a task into named sub-steps whose minutes add up to the remaining effort. */
export function breakDownTask(task, customSteps) {
  const total = remainingMinutes(task);
  if (total <= 60 && !customSteps) return [{ title: `Complete: ${task.title}`, minutes: total }];
  let template = STEP_TEMPLATES[task.type] || STEP_TEMPLATES.other;
  if (Array.isArray(customSteps) && customSteps.length) {
    const sum = customSteps.reduce((s, st) => s + (Number(st.fraction) > 0 ? Number(st.fraction) : 1), 0);
    template = customSteps.map((st) => [String(st.title).slice(0, 120), (Number(st.fraction) > 0 ? Number(st.fraction) : 1) / sum]);
  }
  const steps = template.map(([title, fraction]) => ({ title, minutes: Math.max(15, roundTo5(total * fraction)) }));
  return steps;
}

function chunkSteps(task, steps, sessionMinutes) {
  const chunks = [];
  steps.forEach((step, stepIndex) => {
    let left = step.minutes;
    let part = 1;
    const parts = Math.ceil(step.minutes / sessionMinutes);
    while (left > 0) {
      let minutes = Math.min(sessionMinutes, left);
      if (left - minutes > 0 && left - minutes < 15) minutes = left;
      chunks.push({
        taskId: task.id,
        step: parts > 1 ? `${step.title} (${part}/${parts})` : step.title,
        stepIndex,
        minutes,
      });
      left -= minutes;
      part += 1;
    }
  });
  return chunks;
}

/**
 * Generates a day-by-day study schedule.
 * Strategy: earliest-deadline-first with overdue work kept near the top and a
 * per-day session cap per task so days stay varied.
 */
export function generatePlan(analyzedTasks, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const days = Math.min(14, Math.max(1, Number(options.days) || 7));
  const hoursPerDay = Math.min(12, Math.max(1, Number(options.hoursPerDay) || 4));
  const startHour = Math.min(20, Math.max(5, Number(options.startHour ?? 9)));
  const endHour = Math.min(24, Math.max(startHour + 1, Number(options.endHour ?? 22)));
  const sessionMinutes = Math.min(120, Math.max(25, Number(options.sessionMinutes) || 50));
  const breakMinutes = Math.min(30, Math.max(0, Number(options.breakMinutes ?? 10)));
  const tz = Number(options.tzOffsetMinutes) || 0; // same sign as Date#getTimezoneOffset
  const customSteps = options.customSteps || {};

  const active = analyzedTasks.filter((t) => !t.completed);
  const byId = new Map(active.map((t) => [t.id, t]));

  const breakdown = active.map((task) => ({
    taskId: task.id,
    title: task.title,
    course: task.course,
    type: task.type,
    level: task.level,
    dueDate: task.dueDate,
    steps: breakDownTask(task, customSteps[task.id]),
  }));

  const queues = new Map(breakdown.map((b) => [b.taskId, chunkSteps(byId.get(b.taskId), b.steps, sessionMinutes)]));
  
  const localNow = new Date(now.getTime() - tz * MIN);
  const nowMinutes = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
  const scheduleDays = [];
  const atRisk = new Set();

  for (let d = 0; d < days; d += 1) {
    const local = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + d));
    const dayKey = local.toISOString().slice(0, 10);
    const midnightAbs = local.getTime() + tz * MIN;
    let clock = startHour * 60;
    if (d === 0) clock = Math.max(clock, Math.ceil((nowMinutes + 10) / 15) * 15);
    let capacity = Math.min(hoursPerDay * 60, endHour * 60 - clock);
    const perTaskToday = new Map();
    const sessions = [];

    while (capacity >= 15) {
      const dayStartAbs = midnightAbs + clock * MIN;
      const candidates = [];
      for (const [id, q] of queues) {
        if (!q.length) continue;
        const t = byId.get(id);
        // Work on a task whose deadline passes during the plan is pointless (e.g. studying after the exam).
        if (!t.isOverdue && t.dueDate && new Date(t.dueDate).getTime() <= dayStartAbs + 15 * MIN) {
          atRisk.add(id);
          continue;
        }
        candidates.push(t);
      }
      if (!candidates.length) break;
      const capFor = (t) => (t.dueDate && !t.isOverdue && new Date(t.dueDate).getTime() - dayStartAbs < 24 * HOUR ? 3 : 2);
      let pool = candidates.filter((t) => (perTaskToday.get(t.id) || 0) < capFor(t));
      if (!pool.length) pool = candidates;
      // Earliest-deadline-first. Overdue work is already late, so it is treated as
      // "due in 36h": near the top, without starving work that can still be saved.
      const deadlineKey = (t) => {
        if (t.isOverdue) return 36 - t.urgencyScore / 100;
        if (!t.dueDate) return 1e9;
        return (new Date(t.dueDate).getTime() - dayStartAbs) / HOUR - t.urgencyScore / 100;
      };
      pool.sort((a, b) => deadlineKey(a) - deadlineKey(b));
      const task = pool[0];
      const queue = queues.get(task.id);
      const chunk = queue[0];
      let minutes = chunk.minutes;
      if (minutes > capacity) {
        if (capacity < 25 && chunk.minutes - capacity >= 15) break;
        minutes = capacity;
        chunk.minutes -= minutes;
      } else {
        queue.shift();
      }
      const startAbs = midnightAbs + clock * MIN;
      const endAbs = startAbs + minutes * MIN;
      const late = Boolean(!task.isOverdue && task.dueDate && endAbs > new Date(task.dueDate).getTime());
      if (late) atRisk.add(task.id);
      sessions.push({
        id: `${dayKey}-${sessions.length + 1}`,
        taskId: task.id,
        title: task.title,
        course: task.course,
        type: task.type,
        level: task.level,
        step: chunk.step,
        start: toClock(clock),
        end: toClock(clock + minutes),
        startsAt: new Date(startAbs).toISOString(),
        minutes,
        afterDeadline: late,
      });
      perTaskToday.set(task.id, (perTaskToday.get(task.id) || 0) + 1);
      capacity -= minutes;
      clock += minutes + breakMinutes;
      if (clock >= endHour * 60) break;
    }

    scheduleDays.push({
      date: dayKey,
      sessions,
      totalMinutes: sessions.reduce((s, x) => s + x.minutes, 0),
    });
  }

  const warnings = [];
  const horizonEnd = now.getTime() + days * 24 * HOUR;
  for (const [id, q] of queues) {
    const left = q.reduce((s, c) => s + c.minutes, 0);
    const task = byId.get(id);
    const dueInWindow = !task.dueDate || new Date(task.dueDate).getTime() <= horizonEnd;
    if (left > 0 && dueInWindow && !atRisk.has(id)) {
      warnings.push({
        taskId: id,
        type: 'unscheduled',
        message: `“${task.title}” still needs ~${Math.round((left / 60) * 10) / 10}h beyond this ${days}-day plan. Add study hours or extend the plan.`,
      });
    }
  }
  for (const id of atRisk) {
    const left = queues.get(id).reduce((s, c) => s + c.minutes, 0);
    warnings.push({
      taskId: id,
      type: 'at-risk',
      message: `“${byId.get(id).title}” won't be finished before its deadline at ${hoursPerDay}h/day${left ? ` (~${Math.round((left / 60) * 10) / 10}h short)` : ''}. Add study hours, cut scope, or ask for an extension.`,
    });
  }
  for (const t of active.filter((x) => x.isOverdue)) {
    warnings.push({ taskId: t.id, type: 'overdue', message: `“${t.title}” is overdue — it's scheduled early in the plan. Email your instructor if you need an extension.` });
  }

  const order = [];
  for (const day of scheduleDays) for (const s of day.sessions) if (!order.includes(s.taskId)) order.push(s.taskId);
  const recommendations = order.slice(0, 3).map((id, i) => {
    const t = byId.get(id);
    return { rank: i + 1, taskId: id, title: t.title, course: t.course, level: t.level, reason: t.reason };
  });

  const totalMinutes = scheduleDays.reduce((s, d) => s + d.totalMinutes, 0);
  return {
    generatedAt: now.toISOString(),
    engine: 'heuristic',
    settings: { days, hoursPerDay, startHour, endHour, sessionMinutes, breakMinutes, tzOffsetMinutes: tz },
    summary: {
      tasksPlanned: order.length,
      openTasks: active.length,
      totalSessions: scheduleDays.reduce((s, d) => s + d.sessions.length, 0),
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      headline: recommendations.length
        ? `Start with “${recommendations[0].title}”. ${recommendations[0].reason}.`
        : 'Nothing left to plan — you are all caught up!',
    },
    recommendations,
    breakdown,
    days: scheduleDays,
    warnings,
  };
}
