import { sanitizeTask } from '../../server/lib/taskModel.js';

/** Anonymous visitors' data lives only in their own browser (localStorage), never on the server. */
export const TASKS_KEY = 'deadline-rescue:tasks:v1';
export const PREFS_KEY = 'deadline-rescue:prefs:v1';
export const MAX_TASKS = 200;

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // storage disabled (e.g. strict privacy settings)
  }
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return `local-${globalThis.crypto.randomUUID()}`;
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Sanitizes a list of untrusted tasks, assigning ids where missing and dropping duplicates. */
export function cleanTasks(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const t = sanitizeTask(raw, { source: 'local' });
    if (!t) continue;
    if (!t.id || seen.has(t.id)) t.id = newId();
    seen.add(t.id);
    out.push(t);
    if (out.length >= MAX_TASKS) break;
  }
  return out;
}

function readJson(key, storage) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value, storage) {
  try {
    storage?.setItem(key, JSON.stringify(value));
    return Boolean(storage);
  } catch {
    return false; // quota exceeded or storage disabled
  }
}

export const loadTasks = (storage = defaultStorage()) => cleanTasks(readJson(TASKS_KEY, storage)?.tasks);
export const saveTasks = (tasks, storage = defaultStorage()) => writeJson(TASKS_KEY, { version: 1, tasks }, storage);

export function loadPrefs(storage = defaultStorage()) {
  const prefs = readJson(PREFS_KEY, storage);
  return prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? prefs : {};
}
export const savePrefs = (prefs, storage = defaultStorage()) => writeJson(PREFS_KEY, prefs, storage);

/** Builds a task from the assignment form. Returns { task } or { error }. */
export function taskFromForm(form, existing = {}) {
  const hours = form.estimatedHours === '' || form.estimatedHours == null ? null : Number(form.estimatedHours);
  if (hours !== null && (!Number.isFinite(hours) || hours <= 0)) return { error: 'Estimated hours must be a positive number.' };
  const task = sanitizeTask(
    {
      ...existing,
      title: form.title,
      course: form.course,
      type: form.type,
      priority: form.priority,
      estimatedHours: hours,
      dueDate: form.deadline ? fromDateTimeInput(form.deadline) : null,
      completed: Boolean(existing.completed),
    },
    { source: 'local' },
  );
  if (!task) return { error: 'Give the assignment a name.' };
  task.id = existing.id || newId();
  return { task };
}

/** ISO timestamp → value for <input type="datetime-local"> in the browser's local time. */
export function toDateTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value (local time) → ISO timestamp, or null. */
export function fromDateTimeInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function exportTasksJson(tasks, now = new Date()) {
  return JSON.stringify({ app: 'deadline-rescue', version: 1, exportedAt: now.toISOString(), tasks }, null, 2);
}

/** Parses a JSON backup (or a bare array of tasks). Throws on invalid input. */
export function parseTasksImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const list = Array.isArray(data) ? data : data?.tasks;
  if (!Array.isArray(list)) throw new Error('No assignments found in that file.');
  const tasks = cleanTasks(list);
  if (!tasks.length && list.length) throw new Error('No valid assignments found in that file.');
  return tasks;
}
