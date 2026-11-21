import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Download, Lock, Pencil, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import TaskRow from '../components/TaskRow.jsx';
import { Card, CardHeader, EmptyState, PageHeader } from '../components/ui.jsx';
import { useData } from '../context/DataContext.jsx';
import { buildData } from '../lib/engine.js';
import { TYPE_LABELS } from '../lib/format.js';
import { downloadFile } from '../lib/exportPlan.js';
import { exportTasksJson, MAX_TASKS, parseTasksImport, taskFromForm, toDateTimeInput } from '../lib/localStore.js';
import { DEFAULT_EFFORT_HOURS, TASK_TYPES } from '../../server/lib/taskModel.js';

const EMPTY = { title: '', course: '', type: 'assignment', priority: 'medium', deadline: '', estimatedHours: '' };

const formFor = (task) => ({
  title: task.title,
  course: task.course || '',
  type: task.type,
  priority: task.priority || 'medium',
  deadline: toDateTimeInput(task.dueDate),
  estimatedHours: task.estimatedHours ?? '',
});

function Field({ label, children, className }) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function AssignmentForm({ editing, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => (editing ? formFor(editing) : EMPTY));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const { task, error: err } = taskFromForm(form, editing || {});
    if (err) return setError(err);
    onSubmit(task);
    if (!editing) setForm((f) => ({ ...EMPTY, course: f.course, type: f.type }));
    setError(null);
  };

  return (
    <form onSubmit={submit} className="grid gap-4 p-5 pt-4 sm:grid-cols-2" aria-label={editing ? 'Edit assignment' : 'Add assignment'}>
      <Field label="Assignment name" className="sm:col-span-2">
        <input className="input" value={form.title} onChange={set('title')} placeholder="e.g. DSA Quiz 3" maxLength={200} required autoFocus={Boolean(editing)} />
      </Field>
      <Field label="Course">
        <input className="input" value={form.course} onChange={set('course')} placeholder="e.g. Data Structures" maxLength={120} />
      </Field>
      <Field label="Task type">
        <select className="input" value={form.type} onChange={set('type')}>
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Deadline">
        <input className="input" type="datetime-local" value={form.deadline} onChange={set('deadline')} />
      </Field>
      <Field label="Priority">
        <select className="input" value={form.priority} onChange={set('priority')}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </Field>
      <Field label="Estimated hours">
        <input
          className="input"
          type="number"
          min="0.5"
          max="200"
          step="0.5"
          value={form.estimatedHours}
          onChange={set('estimatedHours')}
          placeholder={`Default ${DEFAULT_EFFORT_HOURS[form.type] ?? 3}h for ${TYPE_LABELS[form.type].toLowerCase()}s`}
        />
      </Field>
      <div className="flex items-end gap-2">
        <button type="submit" className="btn-primary flex-1">
          {editing ? <Pencil size={16} /> : <Plus size={16} />} {editing ? 'Save changes' : 'Add assignment'}
        </button>
        {editing && (
          <button type="button" className="btn-ghost" onClick={onCancel} aria-label="Cancel editing">
            <X size={16} />
          </button>
        )}
      </div>
      {error && <p className="text-sm text-rose-300 sm:col-span-2">{error}</p>}
    </form>
  );
}

export default function Assignments() {
  const { localTasks, upsertTask, deleteTask, replaceTasks, notify, source, setSource } = useData();
  const [editing, setEditing] = useState(null);
  const fileRef = useRef(null);
  const analyzed = useMemo(() => buildData(localTasks, 'local').tasks, [localTasks]);
  const full = localTasks.length >= MAX_TASKS;

  const save = (task) => {
    if (!editing && full) return notify(`You can store up to ${MAX_TASKS} assignments.`, 'error');
    upsertTask(task);
    notify(editing ? `Updated “${task.title}”` : `Added “${task.title}”`);
    setEditing(null);
  };

  const remove = (task) => {
    if (!window.confirm(`Delete “${task.title}”? This can't be undone.`)) return;
    deleteTask(task.id);
    if (editing?.id === task.id) setEditing(null);
    notify(`Deleted “${task.title}”`);
  };

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('That file is too large.');
      const tasks = parseTasksImport(await file.text());
      if (localTasks.length && !window.confirm(`Replace your ${localTasks.length} saved assignments with ${tasks.length} from the file?`)) return;
      replaceTasks(tasks);
      notify(`Imported ${tasks.length} assignment${tasks.length === 1 ? '' : 's'}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const clearAll = () => {
    if (!window.confirm('Delete all your saved assignments from this browser?')) return;
    replaceTasks([]);
    setEditing(null);
    notify('All assignments deleted');
  };

  return (
    <>
      <PageHeader
        eyebrow="My Assignments"
        title="Your assignments"
        description="Add your assignments, quizzes, exams and projects. They are stored only in this browser."
        actions={
          <>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Import
            </button>
            <button
              className="btn-ghost"
              disabled={!localTasks.length}
              onClick={() => downloadFile(`deadline-rescue-assignments-${new Date().toISOString().slice(0, 10)}.json`, exportTasksJson(localTasks), 'application/json')}
            >
              <Download size={16} /> Export backup
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importFile} aria-label="Import assignments file" />
          </>
        }
      />

      {source !== 'local' && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-sky-500/20 p-4 animate-fade-up">
          <p className="text-sm text-slate-300">The dashboard is showing {source === 'notion' ? 'your Notion data' : 'demo data'}. Switch to “My Tasks” to see and plan these assignments.</p>
          <button className="btn-primary" onClick={() => setSource('local')}>
            Use my assignments
          </button>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-4">
          <Card className="animate-fade-up">
            <CardHeader title={editing ? 'Edit assignment' : 'Add an assignment'} subtitle={editing ? editing.title : 'Only the name is required'} icon={editing ? Pencil : Plus} />
            <AssignmentForm key={editing?.id || 'new'} editing={editing} onSubmit={save} onCancel={() => setEditing(null)} />
          </Card>
          <Card className="p-4 text-xs leading-relaxed text-slate-400 animate-fade-up">
            <p className="flex items-center gap-2 font-semibold text-slate-300">
              <Lock size={14} /> Private by design
            </p>
            <p className="mt-1.5">
              Your assignments and planner preferences are saved in this browser's local storage, not on our server. Clearing your browser data deletes them, so export a backup
              to move them to another device.
            </p>
          </Card>
        </div>

        <Card className="animate-fade-up">
          <CardHeader
            title="Saved assignments"
            subtitle={`${localTasks.length} stored in this browser${full ? ' (limit reached)' : ''}`}
            icon={ClipboardList}
            action={
              localTasks.length > 0 && (
                <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={clearAll}>
                  <Trash2 size={14} /> Clear all
                </button>
              )
            }
          />
          <div className="p-3">
            {analyzed.length ? (
              <>
                {analyzed.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={(task) => {
                      const original = localTasks.find((x) => x.id === task.id);
                      upsertTask({ ...original, completed: !original.completed, status: original.completed ? 'Not started' : 'Done' });
                    }}
                    actions={
                      <>
                        <button className="btn-ghost p-1.5" onClick={() => setEditing(localTasks.find((x) => x.id === t.id))} aria-label={`Edit ${t.title}`}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn-ghost p-1.5 hover:text-rose-300" onClick={() => remove(t)} aria-label={`Delete ${t.title}`}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    }
                  />
                ))}
                <div className="px-3 pb-2 pt-4">
                  <Link to="/planner" className="btn-primary w-full" onClick={() => source !== 'local' && setSource('local')}>
                    <Sparkles size={16} /> Build my study plan
                  </Link>
                </div>
              </>
            ) : (
              <EmptyState icon={ClipboardList} title="No assignments yet" message="Add your first assignment on the left, or import a backup file." />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
