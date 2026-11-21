import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlarmClock, ArrowRight, BookOpen, CheckCircle2, Flame, Layers, ListTodo, Sparkles, TrendingUp } from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import DataGate from '../components/DataGate.jsx';
import TaskRow from '../components/TaskRow.jsx';
import { Card, CardHeader, EmptyState, PageHeader } from '../components/ui.jsx';
import { formatDay, LEVELS } from '../lib/format.js';
import { greeting } from '../lib/greeting.js';

function StatCard({ label, value, hint, icon: Icon, accent, delay = 0 }) {
  return (
    <Card className="card-hover overflow-hidden p-5 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <p className="label">{label}</p>
        <div className="grid h-9 w-9 place-items-center rounded-xl ring-1 ring-white/10" style={{ background: `${accent}1f` }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}

function ProgressRing({ value }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 140 140" className="h-40 w-40 -rotate-90">
      <defs>
        <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke="url(#ring)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)' }}
      />
    </svg>
  );
}

const tooltipStyle = {
  contentStyle: { background: '#0e111b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 12 },
  labelStyle: { color: '#e2e8f0' },
  itemStyle: { color: '#cbd5e1' },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
};

/** Greeting in the app timezone, re-checked every minute so it changes at the boundary hours. */
function useGreeting() {
  const [text, setText] = useState(() => greeting());
  useEffect(() => {
    const id = setInterval(() => setText(greeting()), 60_000);
    return () => clearInterval(id);
  }, []);
  return text;
}

export default function Dashboard() {
  return <DataGate>{(data) => <DashboardView data={data} />}</DataGate>;
}

function DashboardView({ data }) {
  const { stats, tasks } = data;
  const greetingText = useGreeting();
  const open = tasks.filter((t) => !t.completed);
  const nextUp = open.slice(0, 5);
  const levelData = ['overdue', 'critical', 'high', 'medium', 'low']
    .map((l) => ({ name: LEVELS[l].label, value: stats.byLevel[l] || 0, color: LEVELS[l].color }))
    .filter((d) => d.value > 0);
  const workload = stats.workload.map((d) => ({ ...d, label: formatDay(d.date, { weekday: 'short', day: 'numeric' }) }));

  const headline =
    stats.total === 0
      ? 'No tasks yet — add assignments to your Notion database to get started.'
      : stats.overdue + stats.critical === 0
        ? `You're on track. ${stats.upcoming} deadline${stats.upcoming === 1 ? '' : 's'} in the next 7 days.`
        : `${stats.overdue} overdue and ${stats.critical} critical — let's get you rescued.`;

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={greetingText}
        description={headline}
        actions={
          <>
            <Link to="/radar" className="btn-ghost">
              Deadline Radar
            </Link>
            <Link to="/planner" className="btn-primary">
              <Sparkles size={16} /> Build my study plan
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total assignments" value={stats.total} hint={`${stats.open} still open · ~${stats.remainingHours}h of work`} icon={Layers} accent="#8b5cf6" />
        <StatCard label="Upcoming (7 days)" value={stats.upcoming} hint={`${stats.dueToday} due today`} icon={AlarmClock} accent="#38bdf8" delay={60} />
        <StatCard label="Overdue" value={stats.overdue} hint={stats.overdue ? 'Needs action now' : 'Nothing overdue 🎉'} icon={Flame} accent="#f43f5e" delay={120} />
        <StatCard label="Completed" value={stats.completed} hint={`${stats.completionRate}% completion rate`} icon={CheckCircle2} accent="#34d399" delay={180} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="animate-fade-up">
          <CardHeader title="Overall progress" subtitle="Completed vs. total tasks" icon={TrendingUp} />
          <div className="flex flex-col items-center px-5 pb-6 pt-2">
            <div className="relative">
              <ProgressRing value={stats.completionRate} />
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-3xl font-bold text-white">{stats.completionRate}%</p>
                  <p className="text-[11px] text-slate-500">complete</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center">
              {[
                ['Done', stats.completed, 'text-emerald-300'],
                ['Open', stats.open, 'text-sky-300'],
                ['Critical', stats.critical + stats.overdue, 'text-rose-300'],
              ].map(([l, v, c]) => (
                <div key={l} className="rounded-xl bg-white/[0.03] py-2 ring-1 ring-white/[0.05]">
                  <p className={clsx('text-lg font-bold', c)}>{v}</p>
                  <p className="text-[11px] text-slate-500">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="animate-fade-up lg:col-span-2">
          <CardHeader title="Deadline load · next 14 days" subtitle="Estimated hours of work due each day" icon={BookOpen} />
          <div className="h-64 px-2 pb-4 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workload} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={6} angle={-30} textAnchor="end" height={44} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [n === 'hours' ? `${v}h` : v, n === 'hours' ? 'Work due' : 'Tasks']} />
                <Bar dataKey="hours" fill="url(#bar)" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="animate-fade-up lg:col-span-2">
          <CardHeader
            title="Next up"
            subtitle="Highest-urgency open tasks"
            icon={ListTodo}
            action={
              <Link to="/radar" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300">
                Full radar <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="p-2 pt-3">
            {nextUp.length ? nextUp.map((t) => <TaskRow key={t.id} task={t} />) : <EmptyState icon={CheckCircle2} title="All caught up" message="No open tasks. Enjoy the free time!" />}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="animate-fade-up">
            <CardHeader title="Urgency mix" subtitle="Open tasks by risk level" icon={Flame} />
            {levelData.length ? (
              <div className="flex items-center gap-4 px-5 pb-5 pt-2">
                <div className="h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={levelData} dataKey="value" innerRadius={38} outerRadius={60} paddingAngle={3} stroke="none">
                        {levelData.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5 text-xs">
                  {levelData.map((d) => (
                    <li key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-slate-400">
                        <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                        {d.name}
                      </span>
                      <span className="font-mono text-slate-200">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="px-5 pb-5 pt-3 text-sm text-slate-500">No open tasks.</p>
            )}
          </Card>

          <Card className="animate-fade-up">
            <CardHeader title="Progress by course" icon={BookOpen} />
            <div className="space-y-3 px-5 pb-5 pt-4">
              {stats.byCourse.slice(0, 6).map((c) => {
                const pct = Math.round((c.completed / c.total) * 100);
                return (
                  <div key={c.course}>
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="truncate text-slate-300">{c.course}</span>
                      <span className="shrink-0 font-mono text-slate-500">
                        {c.completed}/{c.total}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {!stats.byCourse.length && <p className="text-sm text-slate-500">No courses found.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
