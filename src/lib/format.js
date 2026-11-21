export const LEVELS = {
  overdue: { label: 'Overdue', color: '#f43f5e', text: 'text-rose-300', bg: 'bg-rose-500/10', ring: 'ring-rose-500/30', dot: 'bg-rose-500' },
  critical: { label: 'Critical', color: '#f97316', text: 'text-orange-300', bg: 'bg-orange-500/10', ring: 'ring-orange-500/30', dot: 'bg-orange-500' },
  high: { label: 'High', color: '#facc15', text: 'text-yellow-200', bg: 'bg-yellow-400/10', ring: 'ring-yellow-400/30', dot: 'bg-yellow-400' },
  medium: { label: 'Medium', color: '#38bdf8', text: 'text-sky-300', bg: 'bg-sky-400/10', ring: 'ring-sky-400/30', dot: 'bg-sky-400' },
  low: { label: 'Low', color: '#34d399', text: 'text-emerald-300', bg: 'bg-emerald-400/10', ring: 'ring-emerald-400/30', dot: 'bg-emerald-400' },
  done: { label: 'Done', color: '#64748b', text: 'text-slate-400', bg: 'bg-slate-500/10', ring: 'ring-slate-500/30', dot: 'bg-slate-500' },
};

export const TYPE_LABELS = {
  exam: 'Exam',
  project: 'Project',
  quiz: 'Quiz',
  assignment: 'Assignment',
  lab: 'Lab',
  reading: 'Reading',
  other: 'Other',
};

export function countdown(hoursLeft) {
  if (hoursLeft === null || hoursLeft === undefined) return 'No deadline';
  const h = Math.abs(hoursLeft);
  const span = h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
  return hoursLeft < 0 ? `${span} late` : `in ${span}`;
}

export function formatDue(iso) {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatDay(dateKey, opts = { weekday: 'long', month: 'short', day: 'numeric' }) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, opts);
}

export function relativeDayLabel(dateKey) {
  const today = new Date();
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (dateKey === key(today)) return 'Today';
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (dateKey === key(tomorrow)) return 'Tomorrow';
  return formatDay(dateKey, { weekday: 'long' });
}

export const hours = (minutes) => `${Math.round((minutes / 60) * 10) / 10}h`;
