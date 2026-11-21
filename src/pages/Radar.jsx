import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlertOctagon, Radar as RadarIcon, Siren, Sparkles } from 'lucide-react';
import DataGate from '../components/DataGate.jsx';
import TaskRow from '../components/TaskRow.jsx';
import { Card, CardHeader, EmptyState, LevelBadge, PageHeader } from '../components/ui.jsx';
import { countdown, LEVELS } from '../lib/format.js';

const RINGS = [
  { hours: 24, label: '1d' },
  { hours: 72, label: '3d' },
  { hours: 168, label: '7d' },
  { hours: 336, label: '14d' },
];
const MAX_R = 140;
const CORE_R = 18;
const radiusFor = (hours) => {
  if (hours === null || hours === undefined) return MAX_R + 6;
  if (hours < 0) return CORE_R * 0.6;
  return CORE_R + (MAX_R - CORE_R) * Math.sqrt(Math.min(hours, 336) / 336);
};

function hashAngle(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 3600;
  return h / 10;
}

function RadarScope({ tasks, onSelect, selectedId }) {
  const courses = [...new Set(tasks.map((t) => t.course || 'Unassigned'))];
  const slice = 360 / Math.max(courses.length, 1);
  const points = tasks.map((t) => {
    const ci = courses.indexOf(t.course || 'Unassigned');
    const jitter = (hashAngle(t.id) / 360) * slice * 0.7 + slice * 0.15;
    const angle = ((ci * slice + jitter - 90) * Math.PI) / 180;
    const r = radiusFor(t.hoursLeft);
    return { t, x: 160 + r * Math.cos(angle), y: 160 + r * Math.sin(angle) };
  });

  return (
    <svg viewBox="0 0 320 320" className="mx-auto w-full max-w-[420px]" role="img" aria-label="Deadline radar visualization">
      <defs>
        <radialGradient id="scope" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(244,63,94,0.25)" />
          <stop offset="60%" stopColor="rgba(139,92,246,0.05)" />
          <stop offset="100%" stopColor="rgba(139,92,246,0)" />
        </radialGradient>
        <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(244,63,94,0)" />
          <stop offset="100%" stopColor="rgba(244,63,94,0.35)" />
        </linearGradient>
      </defs>
      <circle cx="160" cy="160" r={MAX_R + 10} fill="url(#scope)" />
      {RINGS.map((ring) => {
        const r = radiusFor(ring.hours);
        return (
          <g key={ring.label}>
            <circle cx="160" cy="160" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeDasharray="3 4" />
            <text x={160 + 4} y={160 - r + 11} fill="#475569" fontSize="9" fontFamily="JetBrains Mono">
              {ring.label}
            </text>
          </g>
        );
      })}
      {courses.map((_, i) => {
        const a = ((i * slice - 90) * Math.PI) / 180;
        return <line key={i} x1="160" y1="160" x2={160 + MAX_R * Math.cos(a)} y2={160 + MAX_R * Math.sin(a)} stroke="rgba(255,255,255,0.04)" />;
      })}
      <g className="origin-center animate-sweep" style={{ transformOrigin: '160px 160px' }}>
        <path d={`M160 160 L${160 + MAX_R} 160 A${MAX_R} ${MAX_R} 0 0 0 ${160 + MAX_R * Math.cos(-0.6)} ${160 + MAX_R * Math.sin(-0.6)} Z`} fill="url(#sweep)" opacity="0.5" />
      </g>
      <circle cx="160" cy="160" r={CORE_R} fill="rgba(244,63,94,0.12)" stroke="rgba(244,63,94,0.5)" />
      <text x="160" y="163" textAnchor="middle" fill="#fda4af" fontSize="8" fontWeight="700">
        NOW
      </text>
      {points.map(({ t, x, y }) => {
        const color = LEVELS[t.level]?.color || '#94a3b8';
        const selected = t.id === selectedId;
        return (
          <g key={t.id} onClick={() => onSelect(t.id)} className="cursor-pointer">
            {(t.level === 'overdue' || t.level === 'critical') && (
              <circle cx={x} cy={y} r="9" fill={color} opacity="0.25" className="animate-pulse-ring" />
            )}
            <circle cx={x} cy={y} r={selected ? 6.5 : 4.5} fill={color} stroke={selected ? '#fff' : 'rgba(0,0,0,0.4)'} strokeWidth={selected ? 2 : 1} />
            <title>{`${t.title} — ${LEVELS[t.level]?.label} (${countdown(t.hoursLeft)})`}</title>
          </g>
        );
      })}
    </svg>
  );
}

const FILTERS = [
  { id: 'open', label: 'All open' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High' },
  { id: 'later', label: 'Medium & low' },
  { id: 'done', label: 'Completed' },
];

export default function RadarPage() {
  return <DataGate>{(data) => <RadarView data={data} />}</DataGate>;
}

function RadarView({ data }) {
  const [filter, setFilter] = useState('open');
  const [selectedId, setSelectedId] = useState(null);
  const { tasks, stats } = data;
  const open = tasks.filter((t) => !t.completed);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'overdue':
        return tasks.filter((t) => t.level === 'overdue');
      case 'critical':
        return tasks.filter((t) => t.level === 'critical');
      case 'high':
        return tasks.filter((t) => t.level === 'high');
      case 'later':
        return tasks.filter((t) => t.level === 'medium' || t.level === 'low');
      case 'done':
        return tasks.filter((t) => t.completed);
      default:
        return open;
    }
  }, [filter, tasks, open]);

  const alerts = open.filter((t) => t.level === 'overdue' || t.level === 'critical').slice(0, 3);
  const selected = tasks.find((t) => t.id === selectedId);
  const counts = { open: open.length, overdue: stats.byLevel.overdue, critical: stats.byLevel.critical, high: stats.byLevel.high, later: stats.byLevel.medium + stats.byLevel.low, done: stats.completed };

  return (
    <>
      <PageHeader
        eyebrow="Deadline Radar"
        title="What's about to hit you"
        description="Every open task is scored 0–100 on time left, estimated effort, task type and priority. Overdue work is flagged automatically."
        actions={
          <Link to="/planner" className="btn-primary">
            <Sparkles size={16} /> Plan around these
          </Link>
        }
      />

      {alerts.length > 0 && (
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          {alerts.map((t, i) => (
            <Card
              key={t.id}
              className={clsx('card-hover overflow-hidden p-4 animate-fade-up', t.level === 'overdue' ? 'border-rose-500/25' : 'border-orange-500/25')}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60" style={{ backgroundImage: `linear-gradient(135deg, ${LEVELS[t.level].color}1a, transparent 60%)` }} />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: LEVELS[t.level].color }}>
                    {t.level === 'overdue' ? <AlertOctagon size={14} /> : <Siren size={14} />} {t.level === 'overdue' ? 'Overdue' : 'Critical deadline'}
                  </span>
                  <span className="font-mono text-xs text-slate-400">{countdown(t.hoursLeft)}</span>
                </div>
                <p className="mt-2 line-clamp-2 font-semibold text-white">{t.title}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{t.course}</p>
                <p className="mt-2 line-clamp-2 text-xs text-slate-400">{t.reason}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="animate-fade-up lg:col-span-2">
          <CardHeader title="Radar scope" subtitle="Closer to the center = sooner. Slices = courses." icon={RadarIcon} />
          <div className="px-4 pb-4 pt-2">
            {open.length ? <RadarScope tasks={open} onSelect={setSelectedId} selectedId={selectedId} /> : <EmptyState title="Radar is clear" message="No open tasks to track." />}
            <div className="mt-2 flex flex-wrap justify-center gap-3 text-[11px] text-slate-400">
              {['overdue', 'critical', 'high', 'medium', 'low'].map((l) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: LEVELS[l].color }} /> {LEVELS[l].label}
                </span>
              ))}
            </div>
            {selected && (
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 animate-fade-up">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{selected.title}</p>
                  <LevelBadge level={selected.level} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{selected.course}</p>
                <p className="mt-2 text-xs text-slate-300">{selected.reason}</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="animate-fade-up lg:col-span-3">
          <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] p-3">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                  filter === f.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                )}
              >
                {f.label} <span className="ml-1 font-mono text-slate-500">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <div className="max-h-[640px] overflow-y-auto p-2">
            {filtered.length ? (
              filtered.map((t, i) => <TaskRow key={t.id} task={t} rank={filter === 'done' ? undefined : i + 1} showScore />)
            ) : (
              <EmptyState icon={RadarIcon} title="Nothing here" message="No tasks match this filter." />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
