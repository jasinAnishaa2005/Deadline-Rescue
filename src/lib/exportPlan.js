import { TYPE_LABELS } from './format.js';

const pad = (n) => String(n).padStart(2, '0');

/** Date/time in the plan's own timezone (planner settings.tzOffsetMinutes), as "YYYY-MM-DD HH:mm". */
function planLocal(plan, iso) {
  const offset = Number(plan.settings?.tzOffsetMinutes) || 0;
  return new Date(new Date(iso).getTime() - offset * 60000).toISOString().replace('T', ' ').slice(0, 16);
}

const dayTitle = (key) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function planFileName(plan, ext) {
  return `deadline-rescue-plan-${planLocal(plan, plan.generatedAt).slice(0, 10)}.${ext}`;
}

export function planToMarkdown(plan) {
  const date = planLocal(plan, plan.generatedAt);
  const lines = [
    `# Deadline Rescue Study Plan — ${date.slice(0, 10)}`,
    '',
    `Generated ${date} · ${plan.summary.totalSessions} sessions · ${plan.summary.totalHours}h planned · ${plan.engine === 'llm' ? `LLM-assisted (${plan.model})` : 'rule-based engine'}`,
    '',
    `> ${plan.summary.headline}`,
  ];
  if (plan.recommendations?.length) {
    lines.push('', '## Study these first');
    for (const r of plan.recommendations) lines.push(`${r.rank}. **${r.title}**${r.course ? ` (${r.course})` : ''} — ${r.reason}`);
  }
  if (plan.warnings?.length) {
    lines.push('', '## Warnings');
    for (const w of plan.warnings) lines.push(`- ${w.message}`);
  }
  if (plan.tips?.length) {
    lines.push('', '## Coach tips');
    for (const t of plan.tips) lines.push(`- ${t}`);
  }
  lines.push('', '## Schedule');
  for (const day of plan.days) {
    lines.push('', `### ${dayTitle(day.date)}`);
    if (!day.sessions.length) lines.push('- Free day');
    for (const s of day.sessions) {
      lines.push(`- [ ] ${s.start}–${s.end} · ${s.step} — ${s.title}${s.course ? ` (${s.course})` : ''} · ${s.minutes}m${s.afterDeadline ? ' ⚠ ends after the deadline' : ''}`);
    }
  }
  if (plan.breakdown?.length) {
    lines.push('', '## Task breakdown');
    for (const b of plan.breakdown) {
      lines.push('', `### ${b.title}`, `${TYPE_LABELS[b.type] || 'Task'}${b.course ? ` · ${b.course}` : ''} · due ${b.dueDate ? planLocal(plan, b.dueDate) : 'not set'}`);
      b.steps.forEach((st, i) => lines.push(`${i + 1}. ${st.title} (${st.minutes}m)`));
    }
  }
  lines.push('', '---', '_Made with Deadline Rescue — your AI-powered academic survival assistant._', '');
  return lines.join('\n');
}

const icsText = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function icsStamp(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Folds lines longer than 75 octets as required by RFC 5545. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Calendar file (.ics) with one event per study session; importable into Google, Apple and Outlook calendars. */
export function planToIcs(plan) {
  const stamp = icsStamp(plan.generatedAt);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Deadline Rescue//Study Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Deadline Rescue Study Plan'];
  for (const day of plan.days) {
    for (const s of day.sessions) {
      const start = new Date(s.startsAt);
      lines.push(
        'BEGIN:VEVENT',
        `UID:${s.id}-${stamp}@deadline-rescue`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsStamp(start)}`,
        `DTEND:${icsStamp(start.getTime() + s.minutes * 60000)}`,
        `SUMMARY:${icsText(`${s.step} — ${s.title}`)}`,
        `DESCRIPTION:${icsText([s.course, `${s.minutes} min focus session`, s.afterDeadline ? 'Ends after the deadline' : ''].filter(Boolean).join('\n'))}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Triggers a browser download of `content`. */
export function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
