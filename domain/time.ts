import { addDays, format, getDay } from "date-fns";
import type { LocalDate, LocalTime } from "./types";

export const MINUTE = 60_000;
export const HOUR = 3_600_000;

/** Local calendar date of an instant. */
export function toLocalDate(ts: number): LocalDate {
  return format(new Date(ts), "yyyy-MM-dd");
}

/** Local midnight of a calendar date. */
export function parseLocalDate(date: LocalDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isValidLocalDate(date: unknown): date is LocalDate {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = parseLocalDate(date);
  return toLocalDate(d.getTime()) === date;
}

export function isValidLocalTime(t: unknown): t is LocalTime {
  return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function addLocalDays(date: LocalDate, days: number): LocalDate {
  return toLocalDate(addDays(parseLocalDate(date), days).getTime());
}

/** Epoch ms of a wall-clock time on a local date (DST-safe via the Date constructor). */
export function combine(date: LocalDate, time: LocalTime): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

export function timeOf(ts: number): LocalTime {
  return format(new Date(ts), "HH:mm");
}

/**
 * Resolve a start/end wall-clock pair on a date into an interval.
 * An end at or before the start rolls over to the next day (night shifts, 24h shifts).
 */
export function resolveRange(date: LocalDate, start: LocalTime, end: LocalTime) {
  const startTs = combine(date, start);
  let endTs = combine(date, end);
  let overnight = false;
  if (endTs <= startTs) {
    endTs = combine(addLocalDays(date, 1), end);
    overnight = true;
  }
  return { start: startTs, end: endTs, overnight };
}

/** Resolve a wall-clock time to the first instant at or after `anchor` (within 24h). */
export function resolveAfter(anchor: number, time: LocalTime): number {
  const date = toLocalDate(anchor);
  let ts = combine(date, time);
  if (ts < anchor) ts = combine(addLocalDays(date, 1), time);
  return ts;
}

export function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Local dates touched by [start, end). */
export function datesInRange(start: number, end: number): LocalDate[] {
  const out: LocalDate[] = [];
  let d = toLocalDate(start);
  const last = toLocalDate(Math.max(start, end - 1));
  while (d <= last) {
    out.push(d);
    d = addLocalDays(d, 1);
  }
  return out;
}

export function isWeekend(date: LocalDate): boolean {
  const wd = getDay(parseLocalDate(date));
  return wd === 0 || wd === 6;
}

export function hourTime(h: number): LocalTime {
  return `${String(((h % 24) + 24) % 24).padStart(2, "0")}:00`;
}
