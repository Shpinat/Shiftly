import { differenceInCalendarDays, getDay } from "date-fns";
import type { LocalDate } from "./types";
import { addLocalDays, parseLocalDate } from "./time.ts";

export const REPEAT_PATTERNS = ["none", "daily", "weekdays", "weekly", "2/2", "1/3"] as const;
export type RepeatPattern = (typeof REPEAT_PATTERNS)[number];

export const MAX_OCCURRENCES = 366;

/** Dates of a schedule template starting at `start`, inclusive of `until`. */
export function generateDates(start: LocalDate, pattern: RepeatPattern, until: LocalDate): LocalDate[] {
  if (pattern === "none" || until < start) return [start];
  const startDay = getDay(parseLocalDate(start));
  const out: LocalDate[] = [];
  for (let d = start; d <= until && out.length < MAX_OCCURRENCES; d = addLocalDays(d, 1)) {
    const idx = differenceInCalendarDays(parseLocalDate(d), parseLocalDate(start));
    const wd = getDay(parseLocalDate(d));
    const include =
      pattern === "daily" ||
      (pattern === "weekdays" && wd >= 1 && wd <= 5) ||
      (pattern === "weekly" && wd === startDay) ||
      (pattern === "2/2" && idx % 4 < 2) ||
      (pattern === "1/3" && idx % 4 === 0);
    if (include) out.push(d);
  }
  return out;
}
