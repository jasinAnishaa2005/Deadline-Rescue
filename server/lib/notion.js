import notionPkg from '@notionhq/client';

const { Client, APIResponseError } = notionPkg;
import { isDoneLabel, normalizePriority, normalizeType } from './taskModel.js';

export class NotionServiceError extends Error {
  constructor(message, status = 502, code = 'notion_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const FRIENDLY = {
  unauthorized: [401, 'Notion rejected the integration token. Check NOTION_TOKEN in your server .env file.'],
  restricted_resource: [403, 'The integration lacks access. Open the database in Notion → ••• → Connections and add your integration.'],
  object_not_found: [404, 'Notion object not found. Make sure the ID is correct and the page/database is shared with your integration.'],
  rate_limited: [429, 'Notion rate limit reached. Wait a few seconds and try again.'],
  validation_error: [400, 'Notion rejected the request'],
};

export function toServiceError(err) {
  if (err instanceof NotionServiceError) return err;
  if (APIResponseError.isAPIResponseError?.(err) || err?.code in FRIENDLY) {
    const [status, msg] = FRIENDLY[err.code] || [502, 'Notion API error'];
    const detail = err.code === 'validation_error' && err.message ? `: ${err.message}` : '';
    return new NotionServiceError(`${msg}${detail}`, status, err.code);
  }
  return new NotionServiceError(err?.message || 'Unexpected Notion error', 502);
}

const plain = (arr) => (Array.isArray(arr) ? arr.map((t) => t.plain_text ?? t.text?.content ?? '').join('') : '');
const pick = (props, types, regexes) => {
  const entries = Object.entries(props).filter(([, p]) => types.includes(p.type));
  for (const re of regexes) {
    const found = entries.find(([name]) => re.test(name));
    if (found) return found[0];
  }
  return undefined;
};

const words = (name) => name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);
/** Best date/formula property named like a deadline; "Original/Assigned/Overdue" names lose to plain "Due Date". */
function pickDueDate(props) {
  let best;
  let bestScore = 0;
  for (const [name, p] of Object.entries(props)) {
    if (p.type !== 'date' && p.type !== 'formula') continue;
    const w = words(name);
    if (!w.some((x) => /^(due|deadlines?)$/.test(x))) continue;
    // Formula result types aren't in the schema: only trust formulas named like a date
    // ("Due Date", "Deadline"), not countdowns ("Days Until Due") or flags ("Deadlines Met").
    if (p.type === 'formula') {
      if (!/^(due|date|deadlines?)$/.test(w[w.length - 1])) continue;
      if (w.some((x) => /^(days?|hours?|until|till|left|remaining|count|countdown)$/.test(x))) continue;
    }
    const score = 10 - (w.some((x) => /^(original|initial|old|previous|assigned|start|planned)$/.test(x)) ? 5 : 0) + (p.type === 'date' ? 1 : 0);
    if (score > bestScore) [best, bestScore] = [name, score];
  }
  return best;
}

/** Auto-detects which Notion properties hold title/due date/status/etc. */
export function detectSchema(properties, overrides = {}) {
  const props = properties || {};
  const valid = (name) => (name && props[name] ? name : undefined);
  const titleName = valid(overrides.title) || Object.keys(props).find((k) => props[k].type === 'title');

  const due =
    valid(overrides.due) ||
    pickDueDate(props) ||
    pick(props, ['date'], [/date|when|submission/i]) ||
    Object.keys(props).find((k) => props[k].type === 'date');

  const status =
    valid(overrides.status) ||
    Object.keys(props).find((k) => props[k].type === 'status') ||
    pick(props, ['checkbox'], [/done|complete|finished|submitted|status/i]) ||
    pick(props, ['select'], [/status|state|progress/i]);

  const course =
    valid(overrides.course) ||
    pick(props, ['relation', 'select', 'multi_select', 'rich_text', 'rollup', 'formula'], [/course|class|subject|module|unit|lecture/i]);
  const type = valid(overrides.type) || pick(props, ['select', 'multi_select', 'status'], [/^type$|type|category|kind|format/i]);
  const priority = valid(overrides.priority) || pick(props, ['select', 'status', 'number', 'multi_select'], [/priority|importance|urgency/i]);
  const effort = valid(overrides.effort) || pick(props, ['number', 'formula'], [/estimate|effort|hours|duration|time/i]);

  const describe = (name) => (name ? { name, type: props[name].type } : null);
  return {
    title: describe(titleName),
    due: describe(due),
    status: describe(status),
    course: describe(course),
    type: describe(type && type !== status ? type : undefined),
    priority: describe(priority && priority !== status ? priority : undefined),
    effort: describe(effort),
  };
}

function readValue(prop) {
  if (!prop) return undefined;
  switch (prop.type) {
    case 'title':
      return plain(prop.title);
    case 'rich_text':
      return plain(prop.rich_text);
    case 'date':
      return prop.date ? prop.date.start : null;
    case 'status':
      return prop.status?.name ?? null;
    case 'select':
      return prop.select?.name ?? null;
    case 'multi_select':
      return prop.multi_select?.map((o) => o.name).join(', ') || null;
    case 'checkbox':
      return prop.checkbox;
    case 'number':
      return prop.number;
    case 'relation':
      return prop.relation?.map((r) => r.id) ?? [];
    case 'formula': {
      const f = prop.formula || {};
      if (f.type === 'date') return f.date?.start ?? null;
      return f[f.type] ?? null;
    }
    case 'rollup': {
      const r = prop.rollup || {};
      if (r.type === 'array') return r.array.map(readValue).flat().filter(Boolean).join(', ') || null;
      if (r.type === 'date') return r.date?.start ?? null;
      return r[r.type] ?? null;
    }
    default:
      return undefined;
  }
}

/** Converts Notion date strings. Date-only values are treated as 23:59 local time. */
export function toDueDate(value, tzOffsetMinutes = 0) {
  if (!value || typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 23, 59) + tzOffsetMinutes * 60000).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isCompleteStatus(schemaProps, statusField, value) {
  if (!statusField) return false;
  if (statusField.type === 'checkbox') return value === true;
  if (typeof value !== 'string') return false;
  const def = schemaProps?.[statusField.name];
  if (statusField.type === 'status' && def?.status?.groups) {
    const option = def.status.options?.find((o) => o.name === value);
    const group = option && def.status.groups.find((g) => g.option_ids?.includes(option.id));
    if (group) return /complete|done/i.test(group.name);
  }
  return isDoneLabel(value);
}

/** Maps a Notion page to the normalized task model. */
export function mapPageToTask(page, schema, schemaProps, { relationNames = new Map(), tzOffsetMinutes = 0 } = {}) {
  const p = page.properties || {};
  const val = (field) => (field ? readValue(p[field.name]) : undefined);
  const title = val(schema.title) || 'Untitled';
  let course = val(schema.course);
  if (Array.isArray(course)) course = course.map((id) => relationNames.get(id)).filter(Boolean).join(', ') || null;
  const rawStatus = val(schema.status);
  const completed = isCompleteStatus(schemaProps, schema.status, rawStatus);
  const typeRaw = val(schema.type);
  const priorityRaw = val(schema.priority);
  const effortRaw = Number(val(schema.effort));

  return {
    id: page.id,
    title,
    course: course ? String(course) : null,
    type: normalizeType(typeRaw, title),
    dueDate: toDueDate(val(schema.due), tzOffsetMinutes),
    completed,
    status: typeof rawStatus === 'boolean' ? (rawStatus ? 'Done' : 'Not done') : rawStatus || null,
    priority: typeof priorityRaw === 'number' ? (priorityRaw >= 3 ? 'high' : priorityRaw <= 1 ? 'low' : 'medium') : normalizePriority(priorityRaw),
    estimatedHours: Number.isFinite(effortRaw) && effortRaw > 0 ? effortRaw : null,
    url: page.url || null,
    source: 'notion',
  };
}

const TASK_DB_PATTERN = /assignment|task|homework|deadline|coursework|to-?do/i;
const CACHE_MS = 5 * 60 * 1000;

const text = (content) => [{ type: 'text', text: { content: String(content).slice(0, 1900) } }];
const block = (type, payload) => ({ object: 'block', type, [type]: payload });

export function planToBlocks(plan) {
  const blocks = [];
  const fmtDay = (d) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  blocks.push(
    block('callout', {
      rich_text: text(`${plan.summary?.headline || 'Study plan'} — ${plan.summary?.totalSessions ?? 0} sessions, ${plan.summary?.totalHours ?? 0}h total.`),
      icon: { type: 'emoji', emoji: '🚨' },
      color: 'red_background',
    }),
  );
  if (plan.recommendations?.length) {
    blocks.push(block('heading_2', { rich_text: text('Study these first') }));
    for (const r of plan.recommendations) {
      blocks.push(block('numbered_list_item', { rich_text: text(`${r.title}${r.course ? ` (${r.course})` : ''} — ${r.reason}`) }));
    }
  }
  if (plan.tips?.length) {
    blocks.push(block('heading_2', { rich_text: text('Coach tips') }));
    for (const tip of plan.tips) blocks.push(block('bulleted_list_item', { rich_text: text(tip) }));
  }
  if (plan.warnings?.length) {
    blocks.push(block('heading_2', { rich_text: text('Warnings') }));
    for (const w of plan.warnings) blocks.push(block('bulleted_list_item', { rich_text: text(`⚠️ ${w.message}`) }));
  }
  blocks.push(block('divider', {}));
  for (const day of plan.days || []) {
    if (!day.sessions?.length) continue;
    blocks.push(block('heading_2', { rich_text: text(`${fmtDay(day.date)} · ${Math.round((day.totalMinutes / 60) * 10) / 10}h`) }));
    for (const s of day.sessions) {
      blocks.push(
        block('to_do', {
          rich_text: text(`${s.start}–${s.end} · ${s.title} — ${s.step}${s.course ? ` [${s.course}]` : ''} (${s.minutes} min)`),
          checked: false,
        }),
      );
    }
  }
  blocks.push(block('paragraph', { rich_text: text(`Generated by DEADLINE RESCUE on ${new Date(plan.generatedAt || Date.now()).toUTCString()}`) }));
  return blocks;
}

export function createNotionService(notionConfig, { client } = {}) {
  const configured = Boolean(notionConfig?.token);
  const notion = client || (configured ? new Client({ auth: notionConfig.token }) : null);
  let cache = null;
  const relationCache = new Map();

  const ensure = () => {
    if (!notion) throw new NotionServiceError('Notion is not configured. Add NOTION_TOKEN to the server .env file.', 503, 'not_configured');
  };

  async function listDataSources() {
    ensure();
    try {
      const res = await notion.search({ filter: { property: 'object', value: 'data_source' }, page_size: 50 });
      return res.results.map((ds) => ({
        id: ds.id,
        title: plain(ds.title) || plain(ds.name) || 'Untitled',
        databaseId: ds.parent?.database_id || null,
        url: ds.url || null,
        looksLikeTasks: TASK_DB_PATTERN.test(plain(ds.title)),
      }));
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async function resolveDataSource() {
    ensure();
    if (cache && Date.now() - cache.at < CACHE_MS) return cache;
    try {
      let dataSource;
      const id = notionConfig.tasksDatabaseId;
      if (id) {
        try {
          dataSource = await notion.dataSources.retrieve({ data_source_id: id });
        } catch (err) {
          if (!['object_not_found', 'validation_error'].includes(err?.code)) throw err;
          const db = await notion.databases.retrieve({ database_id: id });
          const first = db.data_sources?.[0];
          if (!first) throw new NotionServiceError('That Notion database has no data sources.', 404, 'object_not_found');
          dataSource = await notion.dataSources.retrieve({ data_source_id: first.id });
        }
      } else {
        const all = await listDataSources();
        const match = all.find((d) => d.looksLikeTasks);
        if (!match) {
          throw new NotionServiceError(
            all.length
              ? 'Could not auto-detect your assignments database. Set NOTION_TASKS_DATABASE_ID in the server .env file.'
              : 'No databases are shared with your integration. In Notion, open your Student OS → ••• → Connections → add the integration.',
            404,
            'database_not_found',
          );
        }
        dataSource = await notion.dataSources.retrieve({ data_source_id: match.id });
      }
      const schema = detectSchema(dataSource.properties, notionConfig.propertyOverrides);
      if (!schema.due) {
        throw new NotionServiceError(
          `The database “${plain(dataSource.title)}” has no date property for deadlines. Add a “Due Date” property or set NOTION_PROP_DUE.`,
          422,
          'schema_error',
        );
      }
      cache = {
        at: Date.now(),
        id: dataSource.id,
        databaseId: dataSource.parent?.database_id || null,
        title: plain(dataSource.title) || 'Untitled',
        url: dataSource.url || null,
        properties: dataSource.properties,
        schema,
      };
      return cache;
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async function resolveRelationNames(ids) {
    const missing = [...new Set(ids)].filter((id) => !relationCache.has(id)).slice(0, 60);
    for (let i = 0; i < missing.length; i += 5) {
      await Promise.all(
        missing.slice(i, i + 5).map(async (id) => {
          try {
            const page = await notion.pages.retrieve({ page_id: id });
            const titleProp = Object.values(page.properties || {}).find((p) => p.type === 'title');
            relationCache.set(id, plain(titleProp?.title) || null);
          } catch {
            relationCache.set(id, null);
          }
        }),
      );
    }
    return relationCache;
  }

  async function fetchTasks({ tzOffsetMinutes = 0 } = {}) {
    const ds = await resolveDataSource();
    try {
      const pages = [];
      let cursor;
      do {
        const res = await notion.dataSources.query({
          data_source_id: ds.id,
          start_cursor: cursor,
          page_size: 100,
          result_type: 'page',
        });
        pages.push(...res.results.filter((r) => r.object === 'page'));
        cursor = res.has_more ? res.next_cursor : undefined;
      } while (cursor && pages.length < 500);

      let relationNames = new Map();
      if (ds.schema.course?.type === 'relation') {
        const ids = pages.flatMap((pg) => pg.properties?.[ds.schema.course.name]?.relation?.map((r) => r.id) || []);
        relationNames = await resolveRelationNames(ids);
      }
      const tasks = pages.map((pg) => mapPageToTask(pg, ds.schema, ds.properties, { relationNames, tzOffsetMinutes }));
      return { tasks, database: { id: ds.id, title: ds.title, url: ds.url }, schema: ds.schema };
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async function setTaskCompleted(pageId, completed) {
    const ds = await resolveDataSource();
    const field = ds.schema.status;
    if (!field) throw new NotionServiceError('No status/checkbox property found to mark tasks complete.', 422, 'schema_error');
    const def = ds.properties[field.name];
    let value;
    if (field.type === 'checkbox') {
      value = { checkbox: completed };
    } else if (field.type === 'status' || field.type === 'select') {
      const options = def[field.type]?.options || [];
      const groups = def.status?.groups || [];
      const inGroup = (re) => {
        const g = groups.find((x) => re.test(x.name));
        return g ? options.find((o) => g.option_ids.includes(o.id)) : undefined;
      };
      const option = completed
        ? inGroup(/complete|done/i) || options.find((o) => isDoneLabel(o.name))
        : inGroup(/progress/i) || inGroup(/to-?do|not started/i) || options.find((o) => !isDoneLabel(o.name));
      if (!option) throw new NotionServiceError(`No suitable “${field.name}” option to set.`, 422, 'schema_error');
      value = { [field.type]: { name: option.name } };
    } else {
      throw new NotionServiceError(`Property “${field.name}” (${field.type}) can't be updated automatically.`, 422, 'schema_error');
    }
    try {
      const page = await notion.pages.retrieve({ page_id: pageId });
      const norm = (id) => (id ? String(id).replace(/-/g, '') : null);
      const parent = page.parent || {};
      const inTasksDb =
        (parent.data_source_id && norm(parent.data_source_id) === norm(ds.id)) ||
        (parent.database_id && ds.databaseId && norm(parent.database_id) === norm(ds.databaseId));
      if (!inTasksDb) throw new NotionServiceError('That page is not in your assignments database.', 403, 'forbidden_page');
      await notion.pages.update({ page_id: pageId, properties: { [field.name]: value } });
    } catch (err) {
      throw toServiceError(err);
    }
  }

  async function resolvePlanParent() {
    if (notionConfig.plansParentPageId) return notionConfig.plansParentPageId;
    const ds = await resolveDataSource();
    if (ds.databaseId) {
      try {
        const db = await notion.databases.retrieve({ database_id: ds.databaseId });
        if (db.parent?.type === 'page_id') return db.parent.page_id;
      } catch (err) {
        throw toServiceError(err);
      }
    }
    throw new NotionServiceError(
      'Could not determine where to save the plan. Set NOTION_PLANS_PARENT_PAGE_ID to a page shared with your integration.',
      422,
      'no_parent',
    );
  }

  async function savePlan(plan) {
    ensure();
    const parentId = await resolvePlanParent();
    const blocks = planToBlocks(plan);
    const dateLabel = new Date(plan.generatedAt || Date.now()).toISOString().slice(0, 10);
    try {
      const page = await notion.pages.create({
        parent: { page_id: parentId },
        icon: { type: 'emoji', emoji: '🚨' },
        properties: { title: { title: text(`Deadline Rescue Study Plan — ${dateLabel}`) } },
        children: blocks.slice(0, 100),
      });
      for (let i = 100; i < blocks.length; i += 100) {
        await notion.blocks.children.append({ block_id: page.id, children: blocks.slice(i, i + 100) });
      }
      return { id: page.id, url: page.url };
    } catch (err) {
      throw toServiceError(err);
    }
  }

  return {
    configured,
    listDataSources,
    resolveDataSource,
    fetchTasks,
    setTaskCompleted,
    savePlan,
    clearCache: () => {
      cache = null;
    },
  };
}
