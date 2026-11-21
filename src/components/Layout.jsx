import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarClock, CheckCircle2, LayoutDashboard, Menu, Radar, RefreshCw, Sparkles, X, XCircle, Plug, FlaskConical } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { SourceBadge } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/radar', label: 'Deadline Radar', icon: Radar },
  { to: '/planner', label: 'AI Study Planner', icon: Sparkles },
  { to: '/notion', label: 'Notion Integration', icon: Plug },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 shadow-lg shadow-brand-500/30">
        <CalendarClock size={20} className="text-white" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-extrabold tracking-[0.18em] text-white">DEADLINE</p>
        <p className="text-sm font-extrabold tracking-[0.18em] text-brand-400">RESCUE</p>
      </div>
    </div>
  );
}

function SourceSwitch() {
  const { source, setSource, status } = useData();
  const notionReady = status?.notion?.configured;
  return (
    <div className="flex rounded-xl border border-white/10 bg-ink-850 p-1 text-xs font-semibold" role="tablist" aria-label="Data source">
      {[
        { id: 'notion', label: 'Notion', disabled: !notionReady },
        { id: 'demo', label: 'Demo' },
      ].map((opt) => (
        <button
          key={opt.id}
          role="tab"
          aria-selected={source === opt.id}
          disabled={opt.disabled}
          title={opt.disabled ? 'Add NOTION_TOKEN to the server .env to enable live Notion data' : undefined}
          onClick={() => setSource(opt.id)}
          className={clsx(
            'rounded-lg px-3 py-1.5 transition',
            source === opt.id ? 'bg-white/10 text-white shadow' : 'text-slate-400 hover:text-slate-200',
            opt.disabled && 'cursor-not-allowed opacity-40 hover:text-slate-400',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toast() {
  const { toast } = useData();
  if (!toast) return null;
  const error = toast.tone === 'error';
  return (
    <div className="fixed bottom-5 right-5 z-50 animate-fade-up" role="status">
      <div className={clsx('card flex max-w-sm items-start gap-3 px-4 py-3 text-sm', error ? 'border-rose-500/30' : 'border-emerald-500/30')}>
        {error ? <XCircle className="mt-0.5 shrink-0 text-rose-400" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={18} />}
        <span className="text-slate-200">{toast.message}</span>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const { source, refresh, loading, data, isDemo, status } = useData();
  const location = useLocation();

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            clsx(
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-gradient-to-r from-brand-500/15 to-violet-500/5 text-white ring-1 ring-brand-500/20' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={18} className={isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const stats = data?.stats;

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/[0.06] bg-ink-900/60 px-4 py-6 backdrop-blur-xl lg:flex">
        <Logo />
        <p className="mt-3 text-xs leading-relaxed text-slate-500">Your AI-powered academic survival assistant.</p>
        <div className="mt-8">{nav}</div>
        {stats && (
          <div className="mt-auto rounded-2xl border border-white/[0.06] bg-gradient-to-br from-brand-500/10 to-violet-500/5 p-4">
            <p className="label">Survival status</p>
            <p className="mt-2 text-2xl font-bold text-white">{stats.completionRate}%</p>
            <p className="text-xs text-slate-400">of work completed</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all duration-700" style={{ width: `${stats.completionRate}%` }} />
            </div>
          </div>
        )}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-white/10 bg-ink-900 p-5 animate-fade-up">
            <div className="mb-8 flex items-center justify-between">
              <Logo />
              <button className="btn-ghost p-2" onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <button className="btn-ghost p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={18} />
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              <SourceBadge source={source} />
              {data?.database && !isDemo && (
                <span className="truncate text-xs text-slate-500">
                  from <span className="text-slate-300">{data.database.title}</span>
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <SourceSwitch />
              <button className="btn-ghost p-2" onClick={refresh} disabled={loading} aria-label="Refresh data" title="Refresh data">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          {isDemo && (
            <div className="flex items-center gap-2 border-t border-amber-400/10 bg-amber-400/[0.06] px-4 py-2 text-xs text-amber-200 sm:px-6 lg:px-8">
              <FlaskConical size={14} className="shrink-0" />
              <span>
                <strong>Demo Mode:</strong> you are viewing realistic sample data, not your Notion workspace.
                {status?.notion?.configured ? ' Switch to “Notion” for live data.' : ' Connect Notion on the Integration page to use your real tasks.'}
              </span>
            </div>
          )}
        </header>
        <main key={location.pathname} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
      <Toast />
    </div>
  );
}
