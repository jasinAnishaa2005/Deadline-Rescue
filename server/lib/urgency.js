import { effortFor } from './taskModel.js';

const HOUR = 3600 * 1000;
const TYPE_WEIGHT = { exam: 1, project: 0.9, quiz: 0.8, lab: 0.75, assignment: 0.7, other: 0.6, reading: 0.5 };
const STUDY_HOURS_PER_DAY = 3;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function formatSpan(hours) {
  const h = Math.abs(hours);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/** Scores a single task's urgency (0-100) and assigns a level + human reason. */
export function scoreTask(task, now = new Date()) {
  const effort = effortFor(task);
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const hoursLeft = due && !Number.isNaN(due.getTime()) ? (due.getTime() - now.getTime()) / HOUR : null;
  const base = { ...task, estimatedHours: effort, hoursLeft: hoursLeft === null ? null : Math.round(hoursLeft * 10) / 10 };

  if (task.completed) {
    return { ...base, isOverdue: false, urgencyScore: 0, level: 'done', reason: 'Completed' };
  }
  if (hoursLeft === null) {
    return { ...base, isOverdue: false, urgencyScore: 10, level: 'low', reason: 'No deadline set' };
  }
  if (hoursLeft < 0) {
    const score = clamp(90 + (TYPE_WEIGHT[task.type] ?? 0.6) * 5 + Math.min(5, -hoursLeft / 24), 90, 100);
    return {
      ...base,
      isOverdue: true,
      urgencyScore: Math.round(score),
      level: 'overdue',
      reason: `Overdue by ${formatSpan(hoursLeft)} — submit or ask for an extension now`,
    };
  }

  const timeScore = 100 / (1 + hoursLeft / 24);
  const availableStudyHours = Math.max(0.5, (hoursLeft / 24) * STUDY_HOURS_PER_DAY);
  const effortRatio = effort / availableStudyHours;
  const effortScore = (Math.min(effortRatio, 1.5) / 1.5) * 100;
  const priorityAdj = task.priority === 'high' ? 8 : task.priority === 'low' ? -8 : 0;
  const score = clamp(0.5 * timeScore + 0.3 * effortScore + 15 * (TYPE_WEIGHT[task.type] ?? 0.6) + priorityAdj, 1, 89);

  let level = score >= 65 || hoursLeft <= 24 ? 'critical' : score >= 42 ? 'high' : score >= 25 ? 'medium' : 'low';
  if (effortRatio >= 1 && level !== 'critical') level = 'critical';

  const parts = [`Due in ${formatSpan(hoursLeft)}`, `needs ~${effort}h`];
  if (effortRatio >= 1) parts.push('more work than time available at 3h/day');
  else if (task.type === 'exam') parts.push('high-stakes exam');
  else if (task.priority === 'high') parts.push('marked high priority');

  return {
    ...base,
    isOverdue: false,
    urgencyScore: Math.round(score),
    level,
    effortRatio: Math.round(effortRatio * 100) / 100,
    reason: parts.join(' · '),
  };
}

export function analyzeTasks(tasks, now = new Date()) {
  return tasks
    .map((t) => scoreTask(t, now))
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
      return (a.hoursLeft ?? Infinity) - (b.hoursLeft ?? Infinity);
    });
}

function localDateKey(date, tzOffsetMinutes) {
  return new Date(date.getTime() - tzOffsetMinutes * 60000).toISOString().slice(0, 10);
}

/** Aggregates dashboard statistics from analyzed tasks. */
export function summarize(analyzed, now = new Date(), tzOffsetMinutes = 0) {
  const total = analyzed.length;
  const completed = analyzed.filter((t) => t.completed).length;
  const overdue = analyzed.filter((t) => t.isOverdue).length;
  const open = analyzed.filter((t) => !t.completed);
  const upcoming = open.filter((t) => t.hoursLeft !== null && t.hoursLeft >= 0 && t.hoursLeft <= 24 * 7).length;
  const dueToday = open.filter(
    (t) => t.dueDate && t.hoursLeft >= 0 && localDateKey(new Date(t.dueDate), tzOffsetMinutes) === localDateKey(now, tzOffsetMinutes),
  ).length;
  const critical = open.filter((t) => t.level === 'critical').length;

  const levels = ['overdue', 'critical', 'high', 'medium', 'low', 'done'];
  const byLevel = Object.fromEntries(levels.map((l) => [l, analyzed.filter((t) => t.level === l).length]));

  const courseMap = new Map();
  for (const t of analyzed) {
    const key = t.course || 'Unassigned';
    const entry = courseMap.get(key) || { course: key, total: 0, completed: 0, open: 0 };
    entry.total += 1;
    if (t.completed) entry.completed += 1;
    else entry.open += 1;
    courseMap.set(key, entry);
  }

  const typeMap = new Map();
  for (const t of open) typeMap.set(t.type, (typeMap.get(t.type) || 0) + 1);

  const workload = [];
  for (let i = 0; i < 14; i += 1) {
    const day = new Date(now.getTime() + i * 24 * HOUR);
    const key = localDateKey(day, tzOffsetMinutes);
    const dayTasks = open.filter((t) => t.dueDate && localDateKey(new Date(t.dueDate), tzOffsetMinutes) === key);
    workload.push({
      date: key,
      count: dayTasks.length,
      hours: Math.round(dayTasks.reduce((s, t) => s + t.estimatedHours, 0) * 10) / 10,
    });
  }

  const remainingHours = Math.round(open.reduce((s, t) => s + t.estimatedHours, 0) * 10) / 10;

  return {
    total,
    completed,
    open: open.length,
    overdue,
    upcoming,
    dueToday,
    critical,
    completionRate: total ? Math.round((completed / total) * 100) : 0,
    remainingHours,
    byLevel,
    byCourse: [...courseMap.values()].sort((a, b) => b.total - a.total),
    byType: [...typeMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    workload,
  };
}
