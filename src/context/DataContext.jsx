import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const DataContext = createContext(null);
const STORAGE_KEY = 'deadline-rescue:source';

export function DataProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [source, setSourceState] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api
      .status()
      .then((s) => {
        setStatus(s);
        setSourceState((current) => {
          if (current === 'notion' && !s.notion.configured) return 'demo';
          return current || (s.notion.configured ? 'notion' : 'demo');
        });
      })
      .catch(() => {
        setStatus({ notion: { configured: false }, ai: { configured: false }, offline: true });
        setSourceState('demo');
      });
  }, []);

  const load = useCallback(async (src) => {
    if (!src) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.tasks(src));
    } catch (err) {
      setData(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(source);
  }, [source, load]);

  const setSource = useCallback((src) => {
    localStorage.setItem(STORAGE_KEY, src);
    setPlan(null);
    setSourceState(src);
  }, []);

  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 3500 ? null : t)), 3600);
  }, []);

  const toggleComplete = useCallback(
    async (task) => {
      const completed = !task.completed;
      try {
        await api.setCompleted(task.id, completed, source);
        notify(completed ? `Marked “${task.title}” complete${source === 'notion' ? ' in Notion' : ''}` : `Reopened “${task.title}”`);
        await load(source);
      } catch (err) {
        notify(err.message, 'error');
      }
    },
    [source, load, notify],
  );

  const value = useMemo(
    () => ({
      status,
      source,
      setSource,
      data,
      loading,
      error,
      refresh: () => load(source),
      toggleComplete,
      plan,
      setPlan,
      toast,
      notify,
      isDemo: source === 'demo',
    }),
    [status, source, setSource, data, loading, error, load, toggleComplete, plan, toast, notify],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
