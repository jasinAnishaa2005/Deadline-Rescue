import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, CircleDashed, Database, ExternalLink, KeyRound, Loader2, Plug, ShieldCheck, Table2, XCircle } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { api } from '../lib/api.js';
import { Card, CardHeader, PageHeader } from '../components/ui.jsx';

const FIELD_LABELS = {
  title: ['Task name', 'NOTION_PROP_TITLE'],
  due: ['Due date', 'NOTION_PROP_DUE'],
  status: ['Status / done', 'NOTION_PROP_STATUS'],
  course: ['Course', 'NOTION_PROP_COURSE'],
  type: ['Type (exam, quiz…)', 'NOTION_PROP_TYPE'],
  priority: ['Priority', 'NOTION_PROP_PRIORITY'],
  effort: ['Estimated hours', 'NOTION_PROP_EFFORT'],
};

const STEPS = [
  ['Create an internal integration', 'Go to notion.so/profile/integrations → “New integration”. Give it Read content, Update content and Insert content capabilities, then copy the secret.'],
  ['Share your Student OS with it', 'Open your Student OS page (or its Assignments/Tasks database) → ••• → Connections → add your integration. Child pages and databases inherit access.'],
  ['Add credentials to the server', 'Copy .env.example to .env and set NOTION_TOKEN. Optionally set NOTION_ASSIGNMENTS_DATABASE_ID (otherwise it is auto-detected) and NOTION_PLANS_PARENT_PAGE_ID.'],
  ['Restart & switch to Notion', 'Restart `npm run dev`, then pick “Notion” in the top bar. Your real tasks and deadlines load instantly.'],
];

function StatusRow({ ok, pending, label, detail }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      {pending ? (
        <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-slate-400" />
      ) : ok ? (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />
      ) : ok === false ? (
        <XCircle size={18} className="mt-0.5 shrink-0 text-rose-400" />
      ) : (
        <CircleDashed size={18} className="mt-0.5 shrink-0 text-slate-500" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-200">{label}</p>
        {detail && <p className="mt-0.5 break-words text-xs text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

export default function NotionPage() {
  const { status, setSource, source, publicMode } = useData();
  const configured = status?.notion?.configured;
  const [conn, setConn] = useState({ state: 'idle' });
  const [dbs, setDbs] = useState(null);

  useEffect(() => {
    if (!configured) return;
    setConn({ state: 'loading' });
    api
      .connection()
      .then((c) => setConn({ state: 'ok', ...c }))
      .catch((err) => setConn({ state: 'error', error: err.message }));
    api
      .databases()
      .then((d) => setDbs(d.databases))
      .catch(() => setDbs([]));
  }, [configured]);

  if (publicMode) {
    return (
      <>
        <PageHeader
          eyebrow="Notion Integration"
          title="Optional: sync your own Notion"
          description="Notion sync is a personal feature. On this public site it is turned off, so no visitor can reach anyone else's workspace."
          actions={
            source !== 'local' && (
              <button className="btn-primary" onClick={() => setSource('local')}>
                Use my own assignments
              </button>
            )
          }
        />
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="p-5 animate-fade-up lg:col-span-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <ShieldCheck size={16} className="text-emerald-400" /> How your data is handled here
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
              <li>• Assignments you add under “My Assignments” are saved only in this browser (localStorage). They are not uploaded to or stored on our server.</li>
              <li>• Plans are generated in your browser with the same planner engine, and you can download them as Markdown or a calendar file.</li>
              <li>• This site never uses a shared Notion token, and it cannot read or write anyone's Notion workspace.</li>
            </ul>
          </Card>
          <Card className="animate-fade-up lg:col-span-2">
            <CardHeader title="Want live Notion sync?" subtitle="Run your own personal copy" icon={KeyRound} />
            <ol className="space-y-4 p-5 pt-4">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-xs font-bold text-white">{i + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="px-5 pb-5 text-xs text-slate-500">Personal copies run with APP_MODE=personal on your own computer. Never deploy personal mode publicly.</p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Notion Integration"
        title="Connect your Student OS"
        description="DEADLINE RESCUE reads assignments straight from your Notion database using the official Notion API and can write study plans back to your workspace."
        actions={
          configured &&
          source !== 'notion' && (
            <button className="btn-primary" onClick={() => setSource('notion')}>
              <Database size={16} /> Use live Notion data
            </button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="animate-fade-up">
            <CardHeader title="Connection status" icon={Plug} />
            <div className="divide-y divide-white/[0.05] px-5 pb-3 pt-2">
              <StatusRow
                ok={status ? Boolean(configured) : undefined}
                pending={!status}
                label="Integration token"
                detail={configured ? 'NOTION_TOKEN is set on the server (never sent to the browser).' : 'NOTION_TOKEN is not set — the app is running in Demo Mode.'}
              />
              <StatusRow
                ok={conn.state === 'ok' ? true : conn.state === 'error' ? false : undefined}
                pending={conn.state === 'loading'}
                label="Assignments database"
                detail={
                  conn.state === 'ok'
                    ? `Connected to “${conn.database.title}”${status.notion.databaseConfigured ? '' : ' (auto-detected)'}.`
                    : conn.state === 'error'
                      ? conn.error
                      : 'Waiting for a token.'
                }
              />
              <StatusRow
                ok={conn.state === 'ok' ? true : undefined}
                label="Save plans back to Notion"
                detail={
                  status?.notion?.plansParentConfigured
                    ? 'Plans are saved under NOTION_PLANS_PARENT_PAGE_ID.'
                    : 'Plans are saved as a sub-page next to your assignments database (set NOTION_PLANS_PARENT_PAGE_ID to choose a page).'
                }
              />
            </div>
            {conn.state === 'ok' && conn.database.url && (
              <div className="px-5 pb-5">
                <a href={conn.database.url} target="_blank" rel="noreferrer" className="btn-ghost text-xs">
                  Open database in Notion <ExternalLink size={14} />
                </a>
              </div>
            )}
          </Card>

          {conn.state === 'ok' && (
            <Card className="animate-fade-up">
              <CardHeader title="Detected property mapping" subtitle="Auto-detected from your database schema. Override with env vars if needed." icon={Table2} />
              <div className="overflow-x-auto p-5 pt-4">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="pb-2 font-semibold">Field</th>
                      <th className="pb-2 font-semibold">Notion property</th>
                      <th className="pb-2 font-semibold">Override</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {Object.entries(FIELD_LABELS).map(([key, [label, env]]) => {
                      const m = conn.schema[key];
                      return (
                        <tr key={key}>
                          <td className="py-2 text-slate-300">{label}</td>
                          <td className="py-2">
                            {m ? (
                              <span className="text-slate-100">
                                {m.name} <span className="font-mono text-[11px] text-slate-500">({m.type})</span>
                              </span>
                            ) : (
                              <span className="text-slate-600">not found — default used</span>
                            )}
                          </td>
                          <td className="py-2 font-mono text-[11px] text-slate-500">{env}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {configured && dbs && (
            <Card className="animate-fade-up">
              <CardHeader title="Databases shared with the integration" subtitle="Copy an ID into NOTION_ASSIGNMENTS_DATABASE_ID to pick a specific one" icon={Database} />
              <ul className="space-y-1 p-3">
                {dbs.map((d) => (
                  <li key={d.id} className={clsx('flex items-center justify-between gap-3 rounded-xl px-3 py-2', d.id === conn.database?.id && 'bg-emerald-500/[0.06] ring-1 ring-emerald-500/20')}>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">{d.title}</p>
                      <p className="truncate font-mono text-[11px] text-slate-500">{d.id}</p>
                    </div>
                    {d.id === conn.database?.id ? (
                      <span className="text-[11px] font-semibold text-emerald-300">In use</span>
                    ) : d.looksLikeTasks ? (
                      <span className="text-[11px] text-slate-500">looks like tasks</span>
                    ) : null}
                  </li>
                ))}
                {!dbs.length && <li className="px-3 py-2 text-sm text-slate-500">No databases shared yet.</li>}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card className="animate-fade-up">
            <CardHeader title="Setup in 4 steps" icon={KeyRound} />
            <ol className="space-y-4 p-5 pt-4">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-xs font-bold text-white">{i + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="p-5 animate-fade-up">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <ShieldCheck size={16} className="text-emerald-400" /> Security
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-400">
              <li>• Your Notion secret lives only in the server's environment (.env, git-ignored).</li>
              <li>• The browser talks to the local API; it never sees the token.</li>
              <li>• The integration can only access pages you explicitly share with it.</li>
            </ul>
          </Card>
          <Card className="p-5 text-xs leading-relaxed text-slate-400 animate-fade-up">
            <p className="text-sm font-semibold text-slate-100">Supported database shapes</p>
            <p className="mt-1.5">
              Works with Notion Student OS-style databases: a title, a date property (e.g. “Due Date”), and a Status, Select or Checkbox for completion. Course can be a
              relation, select or text. Type, priority and estimated hours are optional.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
