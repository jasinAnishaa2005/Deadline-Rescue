import 'dotenv/config';

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Extracts a Notion ID from a raw ID or a notion.so URL. */
export function parseNotionId(value) {
  const v = clean(value);
  if (!v) return undefined;
  const match = v.replace(/-/g, '').match(/[0-9a-f]{32}/i);
  return match ? match[0] : v;
}

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT) || 3001,
    isProduction: env.NODE_ENV === 'production',
    notion: {
      token: clean(env.NOTION_TOKEN),
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
      apiKey: clean(env.OPENAI_API_KEY),
      model: clean(env.OPENAI_MODEL) || 'gpt-4o-mini',
      baseUrl: (clean(env.OPENAI_BASE_URL) || 'https://api.openai.com/v1').replace(/\/$/, ''),
    },
  };
}
