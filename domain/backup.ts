/** Data access: every write to IndexedDB goes through here. */
import type { Break, BreakType, LocalDate, Settings, Shift, WorkProfile } from "@/domain/types";
import { DEFAULT_SETTINGS, makeDefaultProfile } from "@/domain/types";
import { HOUR, addLocalDays, combine, resolveRange, timeOf, toLocalDate } from "@/domain/time";
import { draftDates, draftToEntities, type DraftError, type ShiftDraft } from "@/domain/shiftDraft";
import { db } from "./db";

export const newId = () => crypto.randomUUID();

export class DomainError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export async function ensureDefaults(): Promise<Settings> {
  return db.transaction("rw", db.settings, db.profiles, async () => {
    let settings = await db.settings.get("app");
    if (!settings) {
      settings = { ...DEFAULT_SETTINGS };
      await db.settings.put(settings);
    }
    if (!(await db.profiles.get(settings.activeProfileId))) {
      const first = await db.profiles.toCollection().first();
      const profile = first ?? makeDefaultProfile(settings.activeProfileId);
      if (!first) await db.profiles.put(profile);
      if (profile.id !== settings.activeProfileId) {
        settings = { ...settings, activeProfileId: profile.id };
        await db.settings.put(settings);
      }
    }
    return settings;
  });
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<void> {
  const current = (await db.settings.get("app")) ?? DEFAULT_SETTINGS;
  await db.settings.put({ ...current, ...patch, id: "app" });
}

export async function updateProfile(id: string, patch: Partial<Omit<WorkProfile, "id">>): Promise<void> {
  const p = await db.profiles.get(id);
  if (!p) throw new DomainError("notFound");
  await db.profiles.put({ ...p, ...patch, settings: { ...p.settings, ...(patch.settings ?? {}) }, id });
}

export async function createProfile(name: string, base: WorkProfile): Promise<string> {
  const id = newId();
  await db.profiles.put({ ...base, id, name: name.trim() || base.name, settings: { ...base.settings } });
  await updateSettings({ activeProfileId: id });
  return id;
}

export async function deleteProfile(id: string): Promise<void> {
  await db.transaction("rw", [db.profiles, db.shifts, db.breaks, db.settings], async () => {
    const all = await db.profiles.toArray();
    if (all.length <= 1) throw new DomainError("lastProfile");
    const ids = (await db.shifts.where("profileId").equals(id).primaryKeys()) as string[];
    await db.breaks.where("shiftId").anyOf(ids).delete();
    await db.shifts.bulkDelete(ids);
    await db.profiles.delete(id);
    const s = await db.settings.get("app");
    if (s?.activeProfileId === id) await db.settings.put({ ...s, activeProfileId: all.find((p) => p.id !== id)!.id });
  });
}

export async function getActiveShift(profileId: string): Promise<Shift | undefined> {
  return db.shifts.where("[profileId+status]").equals([profileId, "active"]).first();
}

/**
 * Clock in. Exactly one active shift per profile — enforced inside the transaction.
 * A planned shift of today that has not ended yet is converted instead of creating a duplicate.
 */
export async function startShift(profile: WorkProfile, now = Date.now()): Promise<Shift> {
  return db.transaction("rw", db.shifts, async () => {
    if (await getActiveShift(profile.id)) throw new DomainError("activeExists");
    const today = toLocalDate(now);
    const candidates = await db.shifts.where("[profileId+status]").equals([profile.id, "planned"]).toArray();
    const planned = candidates
      .filter((s) => (s.date === today || s.date === addLocalDays(today, -1)) && (s.plannedEndTimestamp ?? s.startTimestamp) > now && s.startTimestamp - now < 4 * HOUR)
      .sort((a, b) => a.startTimestamp - b.startTimestamp)[0];
    if (planned) {
      const updated: Shift = { ...planned, status: "active", startTimestamp: now, date: today, endTimestamp: null, updatedAt: now };
      await db.shifts.put(updated);
      return updated;
    }
    const cfg = profile.settings;
    const plannedLen = resolveRange(today, cfg.defaultStartTime, cfg.defaultEndTime);
    const shift: Shift = {
      id: newId(),
      profileId: profile.id,
      date: today,
      startTimestamp: now,
      endTimestamp: null,
      plannedStartTimestamp: now,
      plannedEndTimestamp: now + (plannedLen.end - plannedLen.start),
      hourlyRate: null,
      status: "active",
      notes: "",
      shiftType: cfg.defaultShiftType,
      seriesId: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.shifts.add(shift);
    return shift;
  });
}

export async function endShift(shiftId: string, now = Date.now()): Promise<Shift> {
  return db.transaction("rw", db.shifts, db.breaks, async () => {
    const s = await db.shifts.get(shiftId);
    if (!s || s.status !== "active") throw new DomainError("notActive");
    const end = Math.max(now, s.startTimestamp);
    await db.breaks.where("shiftId").equals(shiftId).filter((b) => b.endTimestamp === null).modify({ endTimestamp: end });
    const updated: Shift = { ...s, endTimestamp: end, status: "completed", updatedAt: now };
    await db.shifts.put(updated);
    return updated;
  });
}

/** Undo of clock-out: reopen the shift (only if no other shift became active meanwhile). */
export async function resumeShift(shiftId: string, now = Date.now()): Promise<void> {
  await db.transaction("rw", db.shifts, async () => {
    const s = await db.shifts.get(shiftId);
    if (!s || s.status !== "completed") throw new DomainError("notFound");
    if (await getActiveShift(s.profileId)) throw new DomainError("activeExists");
    await db.shifts.put({ ...s, status: "active", endTimestamp: null, updatedAt: now });
  });
}

export async function startBreak(shiftId: string, type: BreakType, isPaid: boolean, now = Date.now()): Promise<Break> {
  return db.transaction("rw", db.shifts, db.breaks, async () => {
    const s = await db.shifts.get(shiftId);
    if (!s || s.status !== "active") throw new DomainError("notActive");
    const open = await db.breaks.where("shiftId").equals(shiftId).filter((b) => b.endTimestamp === null).first();
    if (open) throw new DomainError("breakOpen");
    const br: Break = { id: newId(), shiftId, startTimestamp: Math.max(now, s.startTimestamp), endTimestamp: null, type, isPaid };
    await db.breaks.add(br);
    return br;
  });
}

export async function endBreak(shiftId: string, now = Date.now()): Promise<void> {
  await db.transaction("rw", db.breaks, async () => {
    const open = await db.breaks.where("shiftId").equals(shiftId).filter((b) => b.endTimestamp === null).first();
    if (!open) throw new DomainError("noBreak");
    await db.breaks.update(open.id, { endTimestamp: Math.max(now, open.startTimestamp) });
  });
}

/** Create (with recurrence) or update a shift from the editor draft. Returns number of saved shifts. */
export async function saveShift(draft: ShiftDraft, profileId: string, now = Date.now()): Promise<number> {
  return db.transaction("rw", db.shifts, db.breaks, async () => {
    const existing = draft.id ? ((await db.shifts.get(draft.id)) ?? null) : null;
    if (draft.id && !existing) throw new DomainError("notFound");
    const dates = draftDates(draft);
    const seriesId = dates.length > 1 ? newId() : null;
    const shifts: Shift[] = [];
    const breaks: Break[] = [];
    for (const date of dates) {
      const res = draftToEntities(draft, date, profileId, now, existing, newId);
      if ("error" in res) throw new DomainError(res.error satisfies DraftError);
      shifts.push(seriesId ? { ...res.shift, seriesId } : res.shift);
      breaks.push(...res.breaks);
    }
    if (existing) {
      // active shift: only closed breaks are edited through the form; keep the running one
      const keepOpen = existing.status === "active" ? await db.breaks.where("shiftId").equals(existing.id).filter((b) => b.endTimestamp === null).toArray() : [];
      await db.breaks.where("shiftId").equals(existing.id).delete();
      breaks.push(...keepOpen);
    }
    await db.shifts.bulkPut(shifts);
    await db.breaks.bulkPut(breaks);
    return shifts.length;
  });
}

export async function deleteShift(id: string): Promise<{ shift: Shift; breaks: Break[] }> {
  return db.transaction("rw", db.shifts, db.breaks, async () => {
    const shift = await db.shifts.get(id);
    if (!shift) throw new DomainError("notFound");
    const breaks = await db.breaks.where("shiftId").equals(id).toArray();
    await db.breaks.where("shiftId").equals(id).delete();
    await db.shifts.delete(id);
    return { shift, breaks };
  });
}

export async function restoreShift(shift: Shift, breaks: Break[]): Promise<void> {
  await db.transaction("rw", db.shifts, db.breaks, async () => {
    await db.shifts.put(shift);
    await db.breaks.bulkPut(breaks);
  });
}

/** Move a shift to another date keeping its wall-clock times; breaks move with it. */
export async function moveShift(id: string, date: LocalDate, now = Date.now()): Promise<void> {
  await db.transaction("rw", db.shifts, db.breaks, async () => {
    const s = await db.shifts.get(id);
    if (!s) throw new DomainError("notFound");
    if (s.status === "active") throw new DomainError("activeLocked");
    const newStart = combine(date, timeOf(s.startTimestamp));
    const delta = newStart - s.startTimestamp;
    const shiftTs = (v: number | null) => (v === null ? null : v + delta);
    await db.shifts.put({
      ...s,
      date,
      startTimestamp: newStart,
      endTimestamp: shiftTs(s.endTimestamp),
      plannedStartTimestamp: shiftTs(s.plannedStartTimestamp),
      plannedEndTimestamp: shiftTs(s.plannedEndTimestamp),
      updatedAt: now,
    });
    await db.breaks
      .where("shiftId")
      .equals(id)
      .modify((b) => {
        b.startTimestamp += delta;
        if (b.endTimestamp !== null) b.endTimestamp += delta;
      });
  });
}

export async function resetAllData(): Promise<void> {
  await db.transaction("rw", [db.shifts, db.breaks, db.profiles, db.settings, db.backups], async () => {
    await Promise.all([db.shifts.clear(), db.breaks.clear(), db.profiles.clear(), db.settings.clear(), db.backups.clear()]);
  });
  await ensureDefaults();
}
