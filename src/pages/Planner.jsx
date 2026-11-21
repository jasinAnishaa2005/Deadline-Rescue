import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Bot, CalendarDays, ChevronDown, Clock, Cpu, Download, ExternalLink, FileText, Lightbulb, ListChecks, Loader2, Save, Sparkles, Target, Wand2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, EmptyState, ErrorPanel, LevelBadge, PageHeader } from '../components/ui.jsx';
import { formatDay, formatDue, hours, LEVELS, relativeDayLabel, TYPE_LABELS } from '../lib/format.js';
import { buildPlan } from '../lib/engine.js';
import { downloadFile, planFileName, planToIcs, planToMarkdown } from '../lib/exportPlan.js';
import { loadPrefs, savePrefs } from '../lib/localStore.js';

const DEFAULTS = { hoursPerDay: 5, days: 7, startHour: 9, sessionMinutes: 50, useAi: true };

function initialSettings() {
  const saved = loadPrefs().planner || {};
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === typeof DEFAULTS[k]) out[k] = saved[k];
  return out;
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </label>
  );
}

function Settings({ settings, setSettings, onGenerate, loading, aiConfigured }) {
  const set = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value) }));
  return (
    <Card className="animate-fade-up">
      <CardHeader title="Planner settings" subtitle="Tell the planner how much time you have" icon={Wand2} />
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-1">
        <Field label={`Study hours per day · ${settings.hoursPerDay}h`}>
          <input type="range" min="1" max="10" step="0.5" value={settings.hoursPerDay} onChange={set('hoursPerDay')} className="w-full accent-rose-500" aria-label="Study hours per day" />
        </Field>
        <Field label="Plan length">
          <select className="input" value={settings.days} onChange={set('days')} aria-label="Plan length">
            {[3, 5, 7, 10, 14].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start studying at">
          <select className="input" value={settings.startHour} onChange={set('startHour')} aria-label="Start hour">
            {Array.from({ length: 14 }, (_, i) => i + 6).map((h) => (
              <option key={h} value={h}>
                {`${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Focus session length">
          <select className="input" value={settings.sessionMinutes} onChange={set('sessionMinutes')} aria-label="Session length">
            <option value={25}>25 min (Pomodoro)</option>
            <option value={50}>50 min (Deep focus)</option>
            <option value={90}>90 min (Marathon)</option>
          </select>
        </Field>
        {aiConfigured && (
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-300">
            <input type="checkbox" checked={settings.useAi} onChange={set('useAi')} className="h-4 w-4 accent-rose-500" />
            <span>
              Use LLM for task breakdown & tips
              <span className="block text-[11px] text-slate-500">Sends your open tasks to the AI provider for this plan only. Nothing is stored.</span>
            </span>
          </label>
        )}
        <button className="btn-primary w-full py-3 sm:col-span-2 lg:col-span-1" onClick={onGenerate} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {loading ? 'Generating plan…' : 'Generate study plan'}
        </button>
      </div>
    </Card>
  );
}

function SessionItem({ s }) {
  const color = LEVELS[s.level]?.color || '#64748b';
  return (
    <div className="relative flex gap-3 pb-3 pl-1 last:pb-0">
      <div className="flex w-14 shrink-0 flex-col items-end pt-0.5">
        <span className="font-mono text-xs text-slate-300">{s.start}</span>
        <span className="font-mono text-[10px] text-slate-600">{s.end}</span>
      </div>
      <div className="relative flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/[0.12] hover:bg-white/[0.04]">
        <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full" style={{ background: color }} />
        <div className="flex items-start justify-between gap-2 pl-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100">{s.step}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {s.title}
              {s.course ? ` · ${s.course}` : ''}
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{s.minutes}m</span>
        </div>
        {s.afterDeadline && <p className="mt-1.5 pl-2 text-[11px] text-rose-300">Ends after this task's deadline</p>}
      </div>
    </div>
  );
}

function Breakdown({ item }) {
  const [open, setOpen] = useState(false);
  const total = item.steps.reduce((s, x) => s + x.minutes, 0);
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <LevelBadge level={item.level} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{item.title}</p>
          <p className="truncate text-xs text-slate-500">
            {TYPE_LABELS[item.type]} · {item.steps.length} steps · {hours(total)} · due {formatDue(item.dueDate)}
          </p>
        </div>
        <ChevronDown size={16} className={clsx('shrink-0 text-slate-500 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-white/[0.06] px-4 py-3">
          {item.steps.map((st, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-slate-300">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/[0.06] font-mono text-[10px] text-slate-400">{i + 1}</span>
                {st.title}
              </span>
              <span className="font-mono text-xs text-slate-500">{st.minutes}m</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function Planner() {
  const { source, isDemo, plan, setPlan, status, notify, clientTasks, publicMode } = useData();
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [activeDay, setActiveDay] = useState(0);

  useEffect(() => {
    savePrefs({ ...loadPrefs(), planner: settings });
  }, [settings]);

  // Browser-stored tasks are planned in the browser; they only go to the server when optional AI help is on.
  const planClientTasks = async () => {
    if (status?.ai?.configured && settings.useAi) {
      try {
        return { ...(await api.planFromTasks(clientTasks, settings)), source };
      } catch {
        return { ...buildPlan(clientTasks, source, settings), notice: 'AI enhancement unavailable — used the built-in planner instead.' };
      }
    }
    return buildPlan(clientTasks, source, settings);
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const result = source === 'notion' ? await api.plan(source, settings) : await planClientTasks();
      setPlan(result);
      setActiveDay(Math.max(0, result.days.findIndex((d) => d.sessions.length)));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.savePlan(plan);
      setSaved({ ...res.page, plan });
      notify('Study plan saved to Notion');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const day = plan?.days[activeDay];
  const canSaveToNotion = !publicMode && status?.notion?.configured;
  const exportPlan = (kind) => {
    if (kind === 'md') downloadFile(planFileName(plan, 'md'), planToMarkdown(plan), 'text/markdown;charset=utf-8');
    else downloadFile(planFileName(plan, 'ics'), planToIcs(plan), 'text/calendar;charset=utf-8');
    notify(kind === 'md' ? 'Plan downloaded as Markdown' : 'Calendar file downloaded — open it to add sessions to your calendar');
  };

  return (
    <>
      <PageHeader
        eyebrow="AI Study Planner"
        title="Your personal rescue plan"
        description="Breaks big assignments into focused sessions and schedules them earliest-deadline-first around your available hours."
        actions={
          plan && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap justify-end gap-2">
                <button className="btn-ghost" onClick={() => exportPlan('md')} title="Download as a Markdown document">
                  <FileText size={16} /> Download
                </button>
                <button className="btn-ghost" onClick={() => exportPlan('ics')} title="Download a calendar file (.ics) for Google, Apple or Outlook Calendar">
                  <Download size={16} /> Add to calendar
                </button>
                {canSaveToNotion && (
                  <button
                    className="btn-primary"
                    onClick={save}
                    disabled={saving || source !== 'notion' || plan.source !== source}
                    title={source !== 'notion' ? 'Switch to live Notion data to save plans' : undefined}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save plan to Notion
                  </button>
                )}
              </div>
              {canSaveToNotion && isDemo && <span className="text-[11px] text-amber-300/80">Demo plans can't be saved to Notion — download them instead.</span>}
            </div>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Settings settings={settings} setSettings={setSettings} onGenerate={generate} loading={loading} aiConfigured={status?.ai?.configured} />
          <Card className="p-4 text-xs text-slate-400">
            <p className="flex items-center gap-2 font-semibold text-slate-300">
              {status?.ai?.configured ? <Bot size={14} /> : <Cpu size={14} />} Planner engine
            </p>
            <p className="mt-1.5 leading-relaxed">
              {status?.ai?.configured
                ? `LLM-assisted (${status.ai.model}) for task breakdowns and coaching tips; scheduling stays deterministic. Falls back to the built-in engine on errors.`
                : publicMode
                  ? 'Built-in rule-based engine (urgency scoring + earliest-deadline-first scheduling). Plans for your own assignments are generated right here in your browser.'
                  : 'Built-in rule-based engine (urgency scoring + earliest-deadline-first scheduling). Add OPENAI_API_KEY on the server for LLM-written breakdowns and tips.'}
            </p>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {error && <ErrorPanel title="Could not generate a plan" message={error.message} />}
          {saved?.plan === plan && (
            <Card className="flex items-center justify-between gap-3 border-emerald-500/25 p-4 animate-fade-up">
              <p className="text-sm text-emerald-200">Plan saved to your Notion workspace.</p>
              {saved.url && (
                <a href={saved.url} target="_blank" rel="noreferrer" className="btn-ghost text-xs">
                  Open in Notion <ExternalLink size={14} />
                </a>
              )}
            </Card>
          )}

          {!plan && !loading && !error && (
            <Card>
              <EmptyState icon={Sparkles} title="No plan yet" message="Adjust your settings and generate a schedule built from your current tasks.">
                <button className="btn-primary" onClick={generate}>
                  <Sparkles size={16} /> Generate study plan
                </button>
              </EmptyState>
            </Card>
          )}

          {plan && (
            <>
              <Card className="overflow-hidden p-5 animate-fade-up">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-violet-500/10" />
                <div className="relative">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10">
                      {plan.engine === 'llm' ? <Bot size={12} /> : <Cpu size={12} />}
                      {plan.engine === 'llm' ? `LLM-assisted · ${plan.model}` : 'Rule-based engine'}
                    </span>
                    <span className="text-[11px] text-slate-500">Generated {new Date(plan.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-white">{plan.summary.headline}</p>
                  {plan.notice && <p className="mt-1 text-xs text-amber-300">{plan.notice}</p>}
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {[
                      ['Focus sessions', plan.summary.totalSessions, Clock],
                      ['Hours planned', `${plan.summary.totalHours}h`, CalendarDays],
                      ['Tasks covered', `${plan.summary.tasksPlanned}/${plan.summary.openTasks}`, Target],
                    ].map(([l, v, Icon]) => (
                      <div key={l} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
                        <Icon size={14} className="text-slate-500" />
                        <p className="mt-1.5 text-xl font-bold text-white">{v}</p>
                        <p className="text-[11px] text-slate-500">{l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {plan.recommendations.length > 0 && (
                <div className="grid gap-3 md:grid-cols-3">
                  {plan.recommendations.map((r, i) => (
                    <Card key={r.taskId} className="card-hover p-4 animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-brand-400">Study #{r.rank}</span>
                        <LevelBadge level={r.level} />
                      </div>
                      <p className="mt-2 line-clamp-2 font-semibold text-white">{r.title}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{r.course}</p>
                      <p className="mt-2 line-clamp-2 text-xs text-slate-400">{r.reason}</p>
                    </Card>
                  ))}
                </div>
              )}

              {(plan.tips?.length > 0 || plan.warnings.length > 0) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {plan.warnings.length > 0 && (
                    <Card className={clsx('animate-fade-up', !plan.tips?.length && 'md:col-span-2')}>
                      <CardHeader title="Risk warnings" subtitle={`${plan.warnings.length} things need attention`} icon={AlertTriangle} />
                      <ul className="space-y-2 p-5 pt-4">
                        {plan.warnings.map((w, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-300">
                            <span className={clsx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', w.type === 'overdue' ? 'bg-rose-500' : w.type === 'at-risk' ? 'bg-orange-500' : 'bg-yellow-400')} />
                            {w.message}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                  {plan.tips?.length > 0 && (
                    <Card className="animate-fade-up">
                      <CardHeader title="Coach tips" icon={Lightbulb} />
                      <ul className="space-y-2 p-5 pt-4">
                        {plan.tips.map((tip, i) => (
                          <li key={i} className="flex gap-2 text-sm text-slate-300">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" /> {tip}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </div>
              )}

              <Card className="animate-fade-up">
                <CardHeader title="Daily schedule" subtitle="Click a day to see its sessions" icon={CalendarDays} />
                <div className="flex gap-2 overflow-x-auto px-5 pb-1 pt-4">
                  {plan.days.map((d, i) => (
                    <button
                      key={d.date}
                      onClick={() => setActiveDay(i)}
                      className={clsx(
                        'flex min-w-[92px] flex-col items-start rounded-xl border px-3 py-2 text-left transition',
                        i === activeDay ? 'border-brand-500/40 bg-brand-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]',
                      )}
                    >
                      <span className={clsx('text-xs font-semibold', i === activeDay ? 'text-white' : 'text-slate-300')}>{relativeDayLabel(d.date)}</span>
                      <span className="text-[11px] text-slate-500">{formatDay(d.date, { month: 'short', day: 'numeric' })}</span>
                      <span className="mt-1 font-mono text-[10px] text-slate-400">{d.sessions.length ? `${d.sessions.length} · ${hours(d.totalMinutes)}` : 'free'}</span>
                    </button>
                  ))}
                </div>
                <div className="p-5">
                  {day?.sessions.length ? (
                    day.sessions.map((s) => <SessionItem key={s.id} s={s} />)
                  ) : (
                    <EmptyState title="Free day" message="Nothing scheduled — rest, review, or get ahead." />
                  )}
                </div>
              </Card>

              <Card className="animate-fade-up">
                <CardHeader title="Task breakdown" subtitle="Large assignments split into smaller, concrete steps" icon={ListChecks} />
                <div className="space-y-2 p-5 pt-4">
                  {plan.breakdown.map((b) => (
                    <Breakdown key={b.taskId} item={b} />
                  ))}
                  {!plan.breakdown.length && <p className="text-sm text-slate-500">No open tasks to break down.</p>}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
