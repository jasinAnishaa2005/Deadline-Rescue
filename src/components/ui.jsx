import clsx from 'clsx';
import { AlertTriangle, Database, FlaskConical, Loader2 } from 'lucide-react';
import { LEVELS } from '../lib/format.js';

export function Card({ className, children, ...props }) {
  return (
    <div className={clsx('card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, action }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.04] ring-1 ring-white/10">
            <Icon className="h-4.5 w-4.5 text-slate-300" size={18} />
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function LevelBadge({ level, className }) {
  const l = LEVELS[level] || LEVELS.low;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', l.bg, l.text, l.ring, className)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', l.dot, (level === 'overdue' || level === 'critical') && 'animate-pulse-ring')} />
      {l.label}
    </span>
  );
}

export function SourceBadge({ source, className }) {
  const demo = source !== 'notion';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ring-1',
        demo ? 'bg-amber-400/10 text-amber-300 ring-amber-400/30' : 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30',
        className,
      )}
    >
      {demo ? <FlaskConical size={12} /> : <Database size={12} />}
      {demo ? 'Demo data' : 'Live Notion'}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400">
      <Loader2 className="animate-spin" size={18} /> {label}
    </div>
  );
}

export function ErrorPanel({ title = 'Something went wrong', message, children }) {
  return (
    <Card className="border-rose-500/20 p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/10 ring-1 ring-rose-500/30">
          <AlertTriangle className="text-rose-400" size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-100">{title}</h3>
          <p className="mt-1 text-sm text-slate-400">{message}</p>
          {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
        </div>
      </div>
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, message, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
          <Icon className="text-slate-400" size={22} />
        </div>
      )}
      <h3 className="font-semibold text-slate-200">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div>
        {eyebrow && <p className="label mb-2 text-brand-400">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
