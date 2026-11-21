/**
 * Optional LLM enhancement for the study planner (OpenAI-compatible Chat
 * Completions API). The scheduler itself is always deterministic; the LLM only
 * proposes task-specific sub-steps and coaching tips. Any failure falls back
 * to the built-in rule-based engine.
 */
export async function getAiPlanAdvice(tasks, aiConfig, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  if (!aiConfig?.apiKey || !tasks.length) return null;
  const top = tasks.slice(0, 8).map((t) => ({
    id: t.id,
    title: t.title,
    course: t.course,
    type: t.type,
    due: t.dueDate,
    estimatedHours: t.estimatedHours,
    urgency: t.level,
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${aiConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiConfig.apiKey}` },
      body: JSON.stringify({
        model: aiConfig.model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an academic coach. For each task, break it into 3-6 concrete, specific study sub-steps with relative effort fractions. ' +
              'Return JSON: {"steps": {"<taskId>": [{"title": string, "fraction": number}]}, "tips": [string, string, string]}. ' +
              'Keep step titles under 70 characters. Tips must be specific to these tasks.',
          },
          { role: 'user', content: JSON.stringify({ now: new Date().toISOString(), tasks: top }) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM request failed with HTTP ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    const ids = new Set(top.map((t) => t.id));
    const steps = {};
    for (const [id, list] of Object.entries(parsed.steps || {})) {
      if (ids.has(id) && Array.isArray(list) && list.length) {
        steps[id] = list.filter((s) => s && typeof s.title === 'string').slice(0, 6);
      }
    }
    const tips = Array.isArray(parsed.tips) ? parsed.tips.filter((t) => typeof t === 'string').slice(0, 5) : [];
    return { steps, tips };
  } finally {
    clearTimeout(timer);
  }
}
