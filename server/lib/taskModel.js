/**
 * Normalized task shape used across the app (both demo + Notion data):
 * { id, title, course, type, dueDate (ISO|null), completed, status, priority,
 *   estimatedHours, url, source: 'demo' | 'notion' }
 */

export const TASK_TYPES = ['exam', 'project', 'quiz', 'assignment', 'lab', 'reading', 'other'];

const TYPE_PATTERNS = [
  ['exam', /exam|midterm|final|test/i],
  ['quiz', /quiz/i],
  ['project', /project|capstone|thesis|presentation|hackathon/i],
  ['lab', /lab|practical/i],
  ['reading', /read|chapter|article/i],
  ['assignment', /assign|homework|hw|problem set|pset|essay|report|worksheet|paper|task/i],
];

export function normalizeType(raw, fallbackText = '') {
  const text = `${raw || ''}`.trim();
  for (const [type, re] of TYPE_PATTERNS) if (text && re.test(text)) return type;
  for (const [type, re] of TYPE_PATTERNS) if (fallbackText && re.test(fallbackText)) return type;
  return text ? 'other' : 'assignment';
}

export function normalizePriority(raw) {
  const text = `${raw || ''}`.toLowerCase();
  if (/high|urgent|critical|p0|p1|!!!/.test(text)) return 'high';
  if (/low|p3|someday/.test(text)) return 'low';
  if (/med|normal|p2/.test(text)) return 'medium';
  return null;
}

export const DEFAULT_EFFORT_HOURS = {
  exam: 8,
  project: 10,
  quiz: 2,
  assignment: 4,
  lab: 3,
  reading: 1.5,
  other: 2,
};

export function effortFor(task) {
  const n = Number(task.estimatedHours);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_EFFORT_HOURS[task.type] ?? 3;
}

export const DONE_PATTERN = /done|complete|finished|submitted|turned in|graded|closed/i;
const NOT_DONE_PATTERN = /\bnot\b|\bun-?(?:done|finished|submitted|completed?|graded|closed|turned in)\b|\bin-?complete|\bpending|\bto-?do/i;

/** True for status labels like "Done" or "Submitted", false for "Not done", "Incomplete", "Unsubmitted". */
export const isDoneLabel = (label) => typeof label === 'string' && DONE_PATTERN.test(label) && !NOT_DONE_PATTERN.test(label);
