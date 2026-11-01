/**
 * Pay & time calculation engine. Pure functions — no UI, no storage.
 * Every duration is derived from timestamps, never from a running counter.
 */
import type { Break, Shift, WorkProfile } from "./types";
import { HOUR, addLocalDays, combine, datesInRange, hourTime, isWeekend, overlap } from "./time.ts";

export interface ShiftMetrics {
  start: number;
  end: number;
  totalMs: number;
  breakMs: number;
  paidBreakMs: number;
  unpaidBreakMs: number;
  /** Paid working time: total minus unpaid breaks. */
  workedMs: number;
  overtimeMs: number;
  nightMs: number;
  weekendMs: number;
  plannedMs: number | null;
  rate: number;
  basePay: number;
  overtimePay: number;
  nightPay: number;
  weekendPay: number;
  extraPay: number;
  totalPay: number;
  openBreak: Break | null;
}

type Interval = [number, number];

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

function subtract(base: Interval, cuts: Interval[]): Interval[] {
  let parts: Interval[] = [base];
  for (const [c0, c1] of cuts) {
    const next: Interval[] = [];
    for (const [p0, p1] of parts) {
      if (c1 <= p0 || c0 >= p1) next.push([p0, p1]);
      else {
        if (c0 > p0) next.push([p0, c0]);
        if (c1 < p1) next.push([c1, p1]);
      }
    }
    parts = next;
  }
  return parts;
}

/** End of a shift for calculation: actual end, or `now` while running (clamped so clock skew never yields negatives). */
export function shiftEnd(shift: Shift, now: number): number {
  return shift.endTimestamp ?? Math.max(shift.startTimestamp, now);
}

export function breakIntervals(shift: Shift, breaks: Break[], now: number, paid: boolean | null): Interval[] {
  const s = shift.startTimestamp;
  const e = shiftEnd(shift, now);
  return mergeIntervals(
    breaks
      .filter((b) => paid === null || b.isPaid === paid)
      .map((b): Interval => [Math.max(s, b.startTimestamp), Math.min(e, b.endTimestamp ?? Math.max(b.startTimestamp, now))]),
  );
}

/** Paid working intervals: shift interval minus unpaid breaks. */
export function workIntervals(shift: Shift, breaks: Break[], now: number): Interval[] {
  const base: Interval = [shift.startTimestamp, shiftEnd(shift, now)];
  return subtract(base, breakIntervals(shift, breaks, now, false));
}

const sum = (ivs: Interval[]) => ivs.reduce((acc, [a, b]) => acc + (b - a), 0);

export function nightMs(intervals: Interval[], startHour: number, endHour: number): number {
  if (startHour === endHour || intervals.length === 0) return 0;
  let total = 0;
  const first = intervals[0][0];
  const last = intervals[intervals.length - 1][1];
  // include the previous day so a window that started yesterday evening is caught
  const days = [addLocalDays(datesInRange(first, last)[0], -1), ...datesInRange(first, last)];
  for (const d of days) {
    const w0 = combine(d, hourTime(startHour));
    const w1 = startHour > endHour ? combine(addLocalDays(d, 1), hourTime(endHour)) : combine(d, hourTime(endHour));
    for (const [a, b] of intervals) total += overlap(a, b, w0, w1);
  }
  return total;
}

export function weekendMs(intervals: Interval[]): number {
  if (intervals.length === 0) return 0;
  let total = 0;
  for (const d of datesInRange(intervals[0][0], intervals[intervals.length - 1][1])) {
    if (!isWeekend(d)) continue;
    const d0 = combine(d, "00:00");
    const d1 = combine(addLocalDays(d, 1), "00:00");
    for (const [a, b] of intervals) total += overlap(a, b, d0, d1);
  }
  return total;
}

export function effectiveRate(shift: Shift, profile: WorkProfile): number {
  return shift.hourlyRate ?? profile.hourlyRate;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeShiftMetrics(shift: Shift, breaks: Break[], profile: WorkProfile, now: number): ShiftMetrics {
  const own = breaks.filter((b) => b.shiftId === shift.id);
  const start = shift.startTimestamp;
  const end = shiftEnd(shift, now);
  const totalMs = Math.max(0, end - start);
  const breakMs = sum(breakIntervals(shift, own, now, null));
  const paidBreakMs = sum(breakIntervals(shift, own, now, true));
  const work = workIntervals(shift, own, now);
  const workedMs = sum(work);
  const unpaidBreakMs = Math.max(0, totalMs - workedMs);
  const cfg = profile.settings;
  const thresholdMs = cfg.overtimeThresholdHours > 0 ? cfg.overtimeThresholdHours * HOUR : Infinity;
  const overtimeMs = Math.max(0, workedMs - thresholdMs);
  const night = nightMs(work, cfg.nightStartHour, cfg.nightEndHour);
  const weekend = weekendMs(work);
  const rate = effectiveRate(shift, profile);
  const h = (ms: number) => ms / HOUR;
  const basePay = round2(h(workedMs) * rate);
  const overtimePay = round2(h(overtimeMs) * rate * Math.max(0, profile.overtimeMultiplier - 1));
  const nightPay = round2((h(night) * rate * cfg.nightBonusPercent) / 100);
  const weekendPay = round2((h(weekend) * rate * cfg.weekendBonusPercent) / 100);
  const extraPay = round2(nightPay + weekendPay);
  const plannedMs =
    shift.plannedStartTimestamp !== null && shift.plannedEndTimestamp !== null
      ? Math.max(0, shift.plannedEndTimestamp - shift.plannedStartTimestamp)
      : null;
  return {
    start,
    end,
    totalMs,
    breakMs,
    paidBreakMs,
    unpaidBreakMs,
    workedMs,
    overtimeMs,
    nightMs: night,
    weekendMs: weekend,
    plannedMs,
    rate,
    basePay,
    overtimePay,
    nightPay,
    weekendPay,
    extraPay,
    totalPay: round2(basePay + overtimePay + extraPay),
    openBreak: own.find((b) => b.endTimestamp === null) ?? null,
  };
}

export function groupBreaks(breaks: Break[]): Map<string, Break[]> {
  const map = new Map<string, Break[]>();
  for (const b of breaks) {
    const list = map.get(b.shiftId);
    if (list) list.push(b);
    else map.set(b.shiftId, [b]);
  }
  for (const list of map.values()) list.sort((a, b) => a.startTimestamp - b.startTimestamp);
  return map;
}

export function computeAll(shifts: Shift[], breaks: Break[], profile: WorkProfile, now: number): Map<string, ShiftMetrics> {
  const grouped = groupBreaks(breaks);
  const out = new Map<string, ShiftMetrics>();
  for (const s of shifts) out.set(s.id, computeShiftMetrics(s, grouped.get(s.id) ?? [], profile, now));
  return out;
}
