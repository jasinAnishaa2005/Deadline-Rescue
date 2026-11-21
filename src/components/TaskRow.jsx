import clsx from 'clsx';
import { Check, ExternalLink } from 'lucide-react';
import { LevelBadge } from './ui.jsx';
import { countdown, formatDue, LEVELS, TYPE_LABELS } from '../lib/format.js';
import { useData } from '../context/DataContext.jsx';

export default function TaskRow({ task, rank, showScore = false, compact = false, actions, onToggle }) {
  const { toggleComplete: toggleInSource } = useData();
  const toggleComplete = onToggle || toggleInSource;
  const level = LEVELS[task.level] || LEVELS.low;
  return (
    <div
      className={clsx(
        'group flex items-center gap-3 rounded-xl border border-transparent px-3 transition hover:border-white/[0.06] hover:bg-white/[0.02]',
        compact ? 'py-2' : 'py-3',
      )}
    >
      {rank !== undefined && <span className="w-6 shrink-0 text-center font-mono text-xs text-slate-500">#{rank}</span>}
      <button
        onClick={() => toggleComplete(task)}
        aria-label={task.completed ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
        className={clsx(
          'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition',
          task.completed ? 'border-emerald-500 bg-emerald-500 text-ink-950' : 'border-white/20 hover:border-emerald-400',
        )}
      >
        {task.completed && <Check size={13} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={clsx('truncate text-sm font-medium', task.completed ? 'text-slate-500 line-through' : 'text-slate-100')}>{task.title}</p>
          {task.url && (
            <a href={task.url} target="_blank" rel="noreferrer" className="text-slate-600 opacity-0 transition group-hover:opacity-100 hover:text-slate-300" aria-label="Open in Notion">
              <ExternalLink size={13} />
            </a>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {[task.course, TYPE_LABELS[task.type], formatDue(task.dueDate)].filter(Boolean).join(' · ')}
        </p>
        {!compact && !task.completed && <p className="mt-1 truncate text-xs text-slate-400">{task.reason}</p>}
      </div>
      {showScore && !task.completed && (
        <div className="hidden w-28 shrink-0 sm:block">
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Urgency</span>
            <span className="font-mono text-slate-300">{task.urgencyScore}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${task.urgencyScore}%`, background: level.color }} />
          </div>
        </div>
      )}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <LevelBadge level={task.level} />
        {!task.completed && (
          <span className={clsx('font-mono text-[11px]', task.isOverdue ? 'text-rose-400' : 'text-slate-500')}>{countdown(task.hoursLeft)}</span>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
