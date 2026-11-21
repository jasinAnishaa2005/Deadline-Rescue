import 'dotenv/config';

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Extracts a Notion ID from a raw ID or a notion.so URL. */
export function parseNotionId(value) {
  const v = clean(value);
  if (!v) return undefined;
  const match = v.replace(/-/g, '').match(/[0-9a-f]{32}/i);
  return match ? match[0] : v;
}

/**
 * "public": anyone on the internet can use the app. The server never touches the owner's Notion
 * workspace and visitors keep their own assignments in their browser.
 * "personal": single-user mode that may use the server's NOTION_TOKEN.
 * Defaults to public in production so a deployment can't expose Notion data by accident.
 */
export function resolveMode(env = process.env) {
  const mode = clean(env.APP_MODE)?.toLowerCase();
  if (mode === 'personal') return 'personal';
  if (mode === 'public') return 'public';
  return env.NODE_ENV === 'production' ? 'public' : 'personal';
}

function parseTrustProxy(value) {
  const v = clean(value);
  if (!v) return undefined;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return /^\d+$/.test(v) ? Number(v) : v;
}

export function loadConfig(env = process.env) {
  const mode = resolveMode(env);
  const publicMode = mode === 'public';
  const token = clean(env.NOTION_TOKEN);
  const aiKey = clean(env.OPENAI_API_KEY);
  // The owner's AI key is only offered to anonymous visitors when explicitly allowed.
  const aiAllowed = !publicMode || clean(env.PUBLIC_AI_ENABLED)?.toLowerCase() === 'true';
  return {
    port: Number(env.PORT) || 3001,
    isProduction: env.NODE_ENV === 'production',
    mode,
    publicMode,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    ignoredNotionToken: publicMode && Boolean(token),
    notion: {
      // Never loaded in public mode, so no request can reach the owner's workspace.
      token: publicMode ? undefined : token,
      tasksDatabaseId: parseNotionId(env.NOTION_ASSIGNMENTS_DATABASE_ID || env.NOTION_TASKS_DATABASE_ID),
      plansParentPageId: parseNotionId(env.NOTION_PLANS_PARENT_PAGE_ID),
      propertyOverrides: {
        title: clean(env.NOTION_PROP_TITLE),
        due: clean(env.NOTION_PROP_DUE),
        status: clean(env.NOTION_PROP_STATUS),
        course: clean(env.NOTION_PROP_COURSE),
        type: clean(env.NOTION_PROP_TYPE),
        priority: clean(env.NOTION_PROP_PRIORITY),
        effort: clean(env.NOTION_PROP_EFFORT),
      },
    },
    ai: {
      apiKey: aiAllowed ? aiKey : undefined,
      model: clean(env.OPENAI_MODEL) || 'gpt-4o-mini',
      baseUrl: (clean(env.OPENAI_BASE_URL) || 'https://api.openai.com/v1').replace(/\/$/, ''),
    },
  };
}
