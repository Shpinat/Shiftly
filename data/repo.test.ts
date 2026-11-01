import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { DB_NAME, SCHEMA_V1, ShiftDB, db } from "./db";
import { endBreak, endShift, ensureDefaults, getActiveShift, moveShift, saveShift, startBreak, startShift } from "./repo";
import { buildPayload, createLocalBackup, importPayload, restoreLocalBackup } from "./backupRepo";
import { DEFAULT_PROFILE_ID, makeDefaultProfile } from "@/domain/types";
import { HOUR, MINUTE, combine, toLocalDate } from "@/domain/time";
import { computeShiftMetrics } from "@/domain/earnings";
import { shiftsToCsv } from "@/domain/backup";
import type { ShiftDraft } from "@/domain/shiftDraft";

const profile = makeDefaultProfile();

beforeEach(async () => {
  await Promise.all([db.shifts.clear(), db.breaks.clear(), db.profiles.clear(), db.settings.clear(), db.backups.clear()]);
  await ensureDefaults();
});

const draft = (p: Partial<ShiftDraft>): ShiftDraft => ({
  date: "2025-03-12", startTime: "09:00", endTime: "17:00", hourlyRate: null, shiftType: "standard", notes: "", status: null,
  breaks: [], repeat: "none", repeatUntil: "2025-03-12", ...p,
});

describe("shift lifecycle", () => {
  it("starts a shift and stores the start timestamp", async () => {
    const t0 = combine("2025-03-12", "09:00");
    const s = await startShift(profile, t0);
    expect(s.status).toBe("active");
    expect(s.startTimestamp).toBe(t0);
    expect(s.date).toBe("2025-03-12");
    expect((await getActiveShift(profile.id))?.id).toBe(s.id);
  });

  it("forbids a second active shift in the same profile", async () => {
    await startShift(profile);
    await expect(startShift(profile)).rejects.toMatchObject({ code: "activeExists" });
    expect(await db.shifts.where("status").equals("active").count()).toBe(1);
  });

  it("handles breaks and closes an open break on clock-out", async () => {
    const t0 = combine("2025-03-12", "09:00");
    const s = await startShift(profile, t0);
    await startBreak(s.id, "lunch", false, t0 + 3 * HOUR);
    await expect(startBreak(s.id, "short", false, t0 + 3 * HOUR + MINUTE)).rejects.toMatchObject({ code: "breakOpen" });
    await endBreak(s.id, t0 + 3.5 * HOUR);
    await startBreak(s.id, "short", true, t0 + 5 * HOUR);
    const ended = await endShift(s.id, t0 + 6 * HOUR);
    const breaks = await db.breaks.where("shiftId").equals(s.id).toArray();
    expect(breaks).toHaveLength(2);
    expect(breaks.every((b) => b.endTimestamp !== null)).toBe(true);
    const m = computeShiftMetrics(ended, breaks, profile, Date.now());
    expect(m.totalMs).toBe(6 * HOUR);
    expect(m.workedMs).toBe(5.5 * HOUR); // unpaid lunch 30m deducted, paid short break (1h) counted
  });

  it("restores the active shift after an app restart", async () => {
    const t0 = Date.now() - 2 * HOUR;
    const s = await startShift(profile, t0);
    await startBreak(s.id, "lunch", false, t0 + HOUR);
    db.close();
    const reopened = new ShiftDB(DB_NAME);
    await reopened.open();
    const active = await reopened.shifts.where("[profileId+status]").equals([profile.id, "active"]).first();
    expect(active?.startTimestamp).toBe(t0);
    const breaks = await reopened.breaks.where("shiftId").equals(s.id).toArray();
    const m = computeShiftMetrics(active!, breaks, profile, t0 + 2 * HOUR);
    expect(m.totalMs).toBe(2 * HOUR);
    expect(m.openBreak).not.toBeNull();
    reopened.close();
    await db.open();
  });

  it("clocks into today's planned shift instead of duplicating it", async () => {
    const today = toLocalDate(Date.now());
    const now = combine(today, "08:55");
    await saveShift(draft({ date: today, startTime: "09:00", endTime: "17:00" }), profile.id, combine(today, "00:00"));
    const s = await startShift(profile, now);
    expect(await db.shifts.count()).toBe(1);
    expect(s.plannedStartTimestamp).toBe(combine(today, "09:00"));
    expect(s.startTimestamp).toBe(now);
  });
});

describe("manual shifts", () => {
  it("supports several shifts on one day", async () => {
    await saveShift(draft({ startTime: "06:00", endTime: "10:00" }), profile.id, combine("2025-04-01", "00:00"));
    await saveShift(draft({ startTime: "18:00", endTime: "23:00" }), profile.id, combine("2025-04-01", "00:00"));
    const day = await db.shifts.where("date").equals("2025-03-12").toArray();
    expect(day).toHaveLength(2);
  });

  it("stores night shifts on their start date with end on the next day", async () => {
    await saveShift(draft({ startTime: "22:00", endTime: "06:00" }), profile.id, combine("2025-04-01", "00:00"));
    const s = (await db.shifts.toArray())[0];
    expect(s.date).toBe("2025-03-12");
    expect(toLocalDate(s.endTimestamp!)).toBe("2025-03-13");
    expect(s.endTimestamp! - s.startTimestamp).toBe(8 * HOUR);
  });

  it("creates a recurring series and moves a shift with its breaks", async () => {
    const n = await saveShift(draft({ repeat: "2/2", repeatUntil: "2025-03-19" }), profile.id, combine("2025-03-01", "00:00"));
    expect(n).toBe(4);
    const all = await db.shifts.orderBy("startTimestamp").toArray();
    expect(new Set(all.map((s) => s.seriesId)).size).toBe(1);
    expect(all.every((s) => s.status === "planned")).toBe(true);
    await saveShift(draft({ id: all[0].id, breaks: [{ startTime: "12:00", endTime: "12:30", type: "lunch", isPaid: false }] }), profile.id, combine("2025-03-01", "00:00"));
    await moveShift(all[0].id, "2025-03-20");
    const moved = await db.shifts.get(all[0].id);
    const b = await db.breaks.where("shiftId").equals(all[0].id).first();
    expect(moved?.date).toBe("2025-03-20");
    expect(b?.startTimestamp).toBe(combine("2025-03-20", "12:00"));
  });
});

describe("export / import", () => {
  it("round-trips JSON and skips duplicates on merge", async () => {
    await saveShift(draft({ breaks: [{ startTime: "12:00", endTime: "12:30", type: "lunch", isPaid: false }] }), profile.id, combine("2025-04-01", "00:00"));
    const payload = JSON.parse(JSON.stringify(await buildPayload()));
    const merged = await importPayload(payload, "merge");
    expect(merged).toEqual({ added: 0, duplicates: 1, invalid: 0 });
    await db.shifts.clear();
    await db.breaks.clear();
    const replaced = await importPayload(payload, "replace");
    expect(replaced.added).toBe(1);
    expect(await db.breaks.count()).toBe(1);
  });

  it("validates input and reports invalid rows", async () => {
    await expect(importPayload({ app: "other" }, "merge")).rejects.toMatchObject({ code: "wrongApp" });
    await expect(importPayload("nope", "merge")).rejects.toMatchObject({ code: "notObject" });
    const payload = await buildPayload();
    const res = await importPayload({ ...payload, shifts: [{ id: 1, date: "bad" }] }, "merge");
    expect(res).toEqual({ added: 0, duplicates: 0, invalid: 1 });
  });

  it("creates and restores a local backup", async () => {
    await saveShift(draft({}), profile.id, combine("2025-04-01", "00:00"));
    const b = await createLocalBackup("test");
    await db.shifts.clear();
    await restoreLocalBackup(b.id);
    expect(await db.shifts.count()).toBe(1);
  });

  it("exports CSV with computed columns", async () => {
    await saveShift(draft({}), profile.id, combine("2025-04-01", "00:00"));
    const shifts = await db.shifts.toArray();
    const m = new Map(shifts.map((s) => [s.id, computeShiftMetrics(s, [], profile, Date.now())]));
    const csv = shiftsToCsv(shifts, m, "RUB");
    const [header, row] = csv.replace("\uFEFF", "").split("\n");
    expect(header).toContain("earnings_RUB");
    expect(row).toContain("2025-03-12,09:00,17:00,completed,standard,8.00,0.00,8.00,0.00,500,4000.00");
  });
});

describe("database migrations", () => {
  it("upgrades a v1 database to v2 without losing data", async () => {
    const name = "migration-test";
    const legacy = new Dexie(name);
    legacy.version(1).stores(SCHEMA_V1);
    await legacy.open();
    await legacy.table("shifts").add({ id: "old", date: "2024-01-10", startTimestamp: 1, endTimestamp: 2, status: "completed", shiftType: "standard", createdAt: 1, updatedAt: 1 });
    await legacy.table("settings").add({ id: "app", theme: "dark", language: "ru", currency: "RUB", timeFormat: "24h", weekStartsOn: 1, notificationsEnabled: false });
    legacy.close();

    const upgraded = new ShiftDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(2);
    const s = await upgraded.shifts.get("old");
    expect(s).toMatchObject({ profileId: DEFAULT_PROFILE_ID, plannedStartTimestamp: null, seriesId: null, hourlyRate: null, notes: "" });
    expect(await upgraded.profiles.get(DEFAULT_PROFILE_ID)).toBeTruthy();
    expect((await upgraded.settings.get("app"))?.activeProfileId).toBe(DEFAULT_PROFILE_ID);
    expect(await upgraded.shifts.where("profileId").equals(DEFAULT_PROFILE_ID).count()).toBe(1);
    upgraded.close();
  });
});
