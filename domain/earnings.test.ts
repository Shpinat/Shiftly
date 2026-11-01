import { describe, expect, it } from "vitest";
import { computeShiftMetrics } from "./earnings";
import { HOUR, MINUTE, combine, resolveRange } from "./time.ts";
import { generateDates } from "./recurrence";
import { draftToEntities, type ShiftDraft } from "./shiftDraft";
import { makeDefaultProfile, type Break, type Shift } from "./types";

const profile = makeDefaultProfile();
profile.hourlyRate = 100;
profile.overtimeMultiplier = 1.5;
profile.settings = { ...profile.settings, overtimeThresholdHours: 8, nightBonusPercent: 20, nightStartHour: 22, nightEndHour: 6, weekendBonusPercent: 50 };

function shift(date: string, start: string, end: string | null, extra: Partial<Shift> = {}): Shift {
  const r = resolveRange(date, start, end ?? start);
  return {
    id: "s1", profileId: profile.id, date, startTimestamp: r.start, endTimestamp: end === null ? null : r.end,
    plannedStartTimestamp: null, plannedEndTimestamp: null, hourlyRate: null, status: end === null ? "active" : "completed",
    notes: "", shiftType: "standard", seriesId: null, createdAt: 0, updatedAt: 0, ...extra,
  };
}
const brk = (start: number, mins: number, isPaid = false, id = "b1"): Break => ({ id, shiftId: "s1", startTimestamp: start, endTimestamp: start + mins * MINUTE, type: "lunch", isPaid });

// 2025-03-12 is a Wednesday, 2025-03-15 a Saturday
describe("earnings engine", () => {
  it("computes a plain day shift", () => {
    const s = shift("2025-03-12", "09:00", "17:00");
    const m = computeShiftMetrics(s, [], profile, Date.now());
    expect(m.totalMs).toBe(8 * HOUR);
    expect(m.workedMs).toBe(8 * HOUR);
    expect(m.overtimeMs).toBe(0);
    expect(m.totalPay).toBe(800);
  });

  it("deducts unpaid breaks and keeps paid breaks as working time", () => {
    const s = shift("2025-03-12", "09:00", "18:00");
    const lunch = brk(combine("2025-03-12", "13:00"), 60, false, "b1");
    const coffee = brk(combine("2025-03-12", "15:00"), 15, true, "b2");
    const m = computeShiftMetrics(s, [lunch, coffee], profile, Date.now());
    expect(m.breakMs).toBe(75 * MINUTE);
    expect(m.paidBreakMs).toBe(15 * MINUTE);
    expect(m.workedMs).toBe(8 * HOUR);
    expect(m.totalPay).toBe(800);
  });

  it("calculates overtime beyond the daily threshold", () => {
    const s = shift("2025-03-12", "08:00", "19:00");
    const m = computeShiftMetrics(s, [], profile, Date.now());
    expect(m.overtimeMs).toBe(3 * HOUR);
    expect(m.basePay).toBe(1100);
    expect(m.overtimePay).toBe(150); // 3h * 100 * 0.5
    expect(m.totalPay).toBe(1250);
  });

  it("handles a night shift crossing midnight with night bonus", () => {
    const s = shift("2025-03-12", "20:00", "04:00");
    expect(s.endTimestamp! - s.startTimestamp).toBe(8 * HOUR);
    const m = computeShiftMetrics(s, [], profile, Date.now());
    expect(m.workedMs).toBe(8 * HOUR);
    expect(m.nightMs).toBe(6 * HOUR); // 22:00–04:00
    expect(m.nightPay).toBe(120);
    expect(m.totalPay).toBe(920);
  });

  it("counts early-morning hours inside the previous night's window", () => {
    const s = shift("2025-03-12", "04:00", "08:00");
    expect(computeShiftMetrics(s, [], profile, Date.now()).nightMs).toBe(2 * HOUR);
  });

  it("excludes unpaid breaks from night time", () => {
    const s = shift("2025-03-12", "22:00", "06:00");
    const b = brk(combine("2025-03-13", "02:00"), 30);
    const m = computeShiftMetrics(s, [b], profile, Date.now());
    expect(m.nightMs).toBe(7.5 * HOUR);
  });

  it("applies weekend bonus only to the weekend part (Fri→Sat overnight)", () => {
    const s = shift("2025-03-14", "20:00", "02:00");
    const m = computeShiftMetrics(s, [], { ...profile, settings: { ...profile.settings, nightBonusPercent: 0 } }, Date.now());
    expect(m.weekendMs).toBe(2 * HOUR);
    expect(m.weekendPay).toBe(100);
  });

  it("uses the shift rate override", () => {
    const s = shift("2025-03-12", "09:00", "10:00", { hourlyRate: 250 });
    expect(computeShiftMetrics(s, [], profile, Date.now()).totalPay).toBe(250);
  });

  it("derives a running shift's duration from timestamps, including an open break", () => {
    const s = shift("2025-03-12", "09:00", null);
    const now = s.startTimestamp + 3 * HOUR;
    const open: Break = { id: "b", shiftId: "s1", startTimestamp: s.startTimestamp + 2 * HOUR, endTimestamp: null, type: "short", isPaid: false };
    const m = computeShiftMetrics(s, [open], profile, now);
    expect(m.totalMs).toBe(3 * HOUR);
    expect(m.workedMs).toBe(2 * HOUR);
    expect(m.openBreak?.id).toBe("b");
  });

  it("never yields negative time when the clock moves backwards", () => {
    const s = shift("2025-03-12", "09:00", null);
    const m = computeShiftMetrics(s, [], profile, s.startTimestamp - HOUR);
    expect(m.totalMs).toBe(0);
    expect(m.totalPay).toBe(0);
  });
});

describe("time model", () => {
  it("rolls an end time at or before the start to the next day", () => {
    expect(resolveRange("2025-03-12", "21:00", "09:00").overnight).toBe(true);
    const day = resolveRange("2025-03-12", "08:00", "08:00");
    expect(day.end - day.start).toBe(24 * HOUR);
  });
});

describe("schedule templates", () => {
  it("generates 2/2, 1/3, weekdays", () => {
    expect(generateDates("2025-03-01", "2/2", "2025-03-08")).toEqual(["2025-03-01", "2025-03-02", "2025-03-05", "2025-03-06"]);
    expect(generateDates("2025-03-01", "1/3", "2025-03-09")).toEqual(["2025-03-01", "2025-03-05", "2025-03-09"]);
    expect(generateDates("2025-03-14", "weekdays", "2025-03-18")).toEqual(["2025-03-14", "2025-03-17", "2025-03-18"]);
  });
});

describe("shift draft", () => {
  const base: ShiftDraft = {
    date: "2025-03-12", startTime: "21:00", endTime: "09:00", hourlyRate: null, shiftType: "night", notes: " x ", status: null,
    breaks: [{ startTime: "01:00", endTime: "01:30", type: "lunch", isPaid: false }], repeat: "none", repeatUntil: "2025-03-12",
  };
  let n = 0;
  const id = () => `id${n++}`;

  it("places breaks after midnight on the next day", () => {
    const r = draftToEntities(base, base.date, "p", combine("2025-04-01", "00:00"), null, id);
    if ("error" in r) throw new Error(r.error);
    expect(r.shift.status).toBe("completed");
    expect(r.breaks[0].startTimestamp).toBe(combine("2025-03-13", "01:00"));
    expect(r.shift.notes).toBe("x");
  });

  it("rejects breaks outside the shift", () => {
    const r = draftToEntities({ ...base, startTime: "09:00", endTime: "12:00", breaks: [{ startTime: "13:00", endTime: "13:30", type: "short", isPaid: false }] }, base.date, "p", Date.now(), null, id);
    expect(r).toEqual({ error: "breakOutside" });
  });

  it("marks future shifts as planned with planned timestamps", () => {
    const r = draftToEntities({ ...base, breaks: [] }, base.date, "p", combine("2025-03-01", "00:00"), null, id);
    if ("error" in r) throw new Error(r.error);
    expect(r.shift.status).toBe("planned");
    expect(r.shift.plannedStartTimestamp).toBe(r.shift.startTimestamp);
  });
});
