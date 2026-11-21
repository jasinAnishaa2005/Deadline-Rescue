async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

const tz = () => new Date().getTimezoneOffset();

export const api = {
  status: () => request('/api/status'),
  connection: () => request('/api/notion/connection'),
  databases: () => request('/api/notion/databases'),
  tasks: (source) => request(`/api/tasks?source=${source}&tz=${tz()}`),
  setCompleted: (id, completed, source) =>
    request(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ completed, source }) }),
  resetDemo: () => request('/api/demo/reset', { method: 'POST' }),
  plan: (source, settings) =>
    request('/api/plan', { method: 'POST', body: JSON.stringify({ source, tzOffsetMinutes: tz(), ...settings }) }),
  /** One-off planning of browser-stored tasks (only used for optional AI help; nothing is stored). */
  planFromTasks: (tasks, settings) =>
    request('/api/plan', { method: 'POST', body: JSON.stringify({ source: 'client', tasks, tzOffsetMinutes: tz(), ...settings }) }),
  savePlan: (plan) => request('/api/plan/save', { method: 'POST', body: JSON.stringify({ plan }) }),
};
