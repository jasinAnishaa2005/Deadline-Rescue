import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { buildData } from '../lib/engine.js';
import { loadTasks, saveTasks, TASKS_KEY } from '../lib/localStore.js';
import { createDemoTasks } from '../../server/lib/demoData.js';

const DataContext = createContext(null);
const STORAGE_KEY = 'deadline-rescue:source';
const CLIENT_SOURCES = ['local', 'demo'];
const OFFLINE_STATUS = { mode: 'public', publicMode: true, notion: { configured: false }, ai: { configured: false }, offline: true };

function readSource() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function DataProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [source, setSourceState] = useState(() => {
    const stored = readSource();
    return CLIENT_SOURCES.includes(stored) ? stored : null;
  });
  const [notionData, setNotionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [toast, setToast] = useState(null);
  // "My Assignments" live only in this browser; demo tasks are generated per visitor so nobody shares state.
  const [localTasks, setLocalTasks] = useState(() => loadTasks());
  const [demoTasks, setDemoTasks] = useState(() => createDemoTasks());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api
      .status()
      .then((s) => {
        setStatus(s);
        setSourceState((current) => {
          const stored = current || readSource();
          if (stored === 'notion') return s.notion.configured ? 'notion' : 'local';
          return stored || (s.notion.configured ? 'notion' : 'local');
        });
      })
      .catch(() => {
        setStatus(OFFLINE_STATUS);
        setSourceState((current) => (CLIENT_SOURCES.includes(current) ? current : 'local'));
      });
  }, []);

  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 3500 ? null : t)), 3600);
  }, []);

  const loadNotion = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotionData(await api.tasks('notion'));
    } catch (err) {
      setNotionData(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (source === 'notion') loadNotion();
    else setError(null);
  }, [source, loadNotion]);

  // Persist local tasks and keep other tabs of the app in sync.
  useEffect(() => {
    if (!saveTasks(localTasks)) notify('Could not save to this browser’s storage — export a backup to keep your assignments.', 'error');
  }, [localTasks, notify]);
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === TASKS_KEY) setLocalTasks(loadTasks());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const clientTasks = source === 'local' ? localTasks : source === 'demo' ? demoTasks : null;
  const clientData = useMemo(
    () => (clientTasks ? buildData(clientTasks, source) : null),
    // `tick` re-runs the analysis so countdowns stay fresh on refresh.
    [clientTasks, source, tick],
  );
  const data = source === 'notion' ? notionData : clientData;

  const refresh = useCallback(() => {
    if (source === 'notion') return loadNotion();
    if (source === 'local') setLocalTasks(loadTasks());
    setTick((t) => t + 1);
  }, [source, loadNotion]);

  const setSource = useCallback((src) => {
    try {
      localStorage.setItem(STORAGE_KEY, src);
    } catch {
      /* storage disabled */
    }
    setPlan(null);
    setSourceState(src);
  }, []);

  const toggleComplete = useCallback(
    async (task) => {
      const completed = !task.completed;
      const message = completed ? `Marked “${task.title}” complete${source === 'notion' ? ' in Notion' : ''}` : `Reopened “${task.title}”`;
      const flip = (list) => list.map((t) => (t.id === task.id ? { ...t, completed, status: completed ? 'Done' : 'In progress' } : t));
      if (source === 'local') {
        setLocalTasks(flip);
        return notify(message);
      }
      if (source === 'demo') {
        setDemoTasks(flip);
        return notify(message);
      }
      try {
        await api.setCompleted(task.id, completed, source);
        notify(message);
        await loadNotion();
      } catch (err) {
        notify(err.message, 'error');
      }
    },
    [source, loadNotion, notify],
  );

  const upsertTask = useCallback((task) => {
    setLocalTasks((list) => (list.some((t) => t.id === task.id) ? list.map((t) => (t.id === task.id ? task : t)) : [...list, task]));
  }, []);
  const deleteTask = useCallback((id) => setLocalTasks((list) => list.filter((t) => t.id !== id)), []);
  const replaceTasks = useCallback((tasks) => setLocalTasks(tasks), []);
  const resetDemo = useCallback(() => setDemoTasks(createDemoTasks()), []);

  const value = useMemo(
    () => ({
      status,
      publicMode: Boolean(status?.publicMode),
      source,
      setSource,
      data,
      loading: source === 'notion' ? loading : false,
      error: source === 'notion' ? error : null,
      refresh,
      toggleComplete,
      plan,
      setPlan,
      toast,
      notify,
      isDemo: source === 'demo',
      isLocal: source === 'local',
      clientTasks,
      localTasks,
      upsertTask,
      deleteTask,
      replaceTasks,
      resetDemo,
    }),
    [status, source, setSource, data, loading, error, refresh, toggleComplete, plan, toast, notify, clientTasks, localTasks, upsertTask, deleteTask, replaceTasks, resetDemo],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
