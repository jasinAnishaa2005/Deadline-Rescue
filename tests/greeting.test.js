import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMEZONE, greeting, greetingForHour, hourIn } from '../src/lib/greeting.js';

// Asia/Dhaka is UTC+6 with no DST, so Dhaka local hour H is UTC hour H-6.
const dhaka = (hh, mm = 0) => new Date(Date.UTC(2026, 10, 21, hh - 6, mm));

describe('greeting', () => {
  it('defaults to Asia/Dhaka', () => {
    expect(DEFAULT_TIMEZONE).toBe('Asia/Dhaka');
    expect(hourIn(dhaka(0, 19))).toBe(0);
  });

  it('says good night at Dhaka midnight even though it is evening in UTC', () => {
    const midnight = new Date('2026-11-21T18:19:00Z'); // 00:19 in Dhaka
    expect(hourIn(midnight, 'UTC')).toBe(18);
    expect(greeting(midnight, 'Asia/Dhaka')).toBe('Good night');
    expect(greeting(dhaka(0, 0))).toBe('Good night');
  });

  it.each([
    [4, 59, 'Good night'],
    [5, 0, 'Good morning'],
    [11, 59, 'Good morning'],
    [12, 0, 'Good afternoon'],
    [16, 59, 'Good afternoon'],
    [17, 0, 'Good evening'],
    [20, 59, 'Good evening'],
    [21, 0, 'Good night'],
    [23, 59, 'Good night'],
  ])('Dhaka %i:%i → %s', (h, m, expected) => {
    expect(greeting(dhaka(h, m), 'Asia/Dhaka')).toBe(expected);
  });

  it('maps every hour to the right range', () => {
    const got = Array.from({ length: 24 }, (_, h) => greetingForHour(h)[5]);
    // n=night, m=morning, a=afternoon, e=evening
    expect(got.join('')).toBe('nnnnnmmmmmmmaaaaaeeeennn');
  });

  it('uses the configured timezone for the same instant', () => {
    const instant = new Date('2026-11-21T06:30:00Z');
    expect(greeting(instant, 'Asia/Dhaka')).toBe('Good afternoon'); // 12:30
    expect(greeting(instant, 'UTC')).toBe('Good morning'); // 06:30
    expect(greeting(instant, 'America/New_York')).toBe('Good night'); // 01:30
  });

  it('falls back to the local clock for an invalid timezone', () => {
    const d = new Date();
    expect(hourIn(d, 'Not/AZone')).toBe(d.getHours());
  });
});
