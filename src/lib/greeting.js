export const DEFAULT_TIMEZONE = 'Asia/Dhaka';

/** App timezone: VITE_APP_TIMEZONE (IANA name, e.g. "Asia/Dhaka"), defaulting to Asia/Dhaka. */
export const APP_TIMEZONE = import.meta.env?.VITE_APP_TIMEZONE || DEFAULT_TIMEZONE;

/** Hour of day (0–23) at `date` in `timeZone`; falls back to the browser's local hour for an invalid zone. */
export function hourIn(date = new Date(), timeZone = APP_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
    return Number(parts.find((p) => p.type === 'hour').value) % 24;
  } catch {
    return date.getHours();
  }
}

export function greetingForHour(hour) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

export function greeting(date = new Date(), timeZone = APP_TIMEZONE) {
  return greetingForHour(hourIn(date, timeZone));
}
