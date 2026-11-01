/** Form model ↔ entity conversion for the shift editor. Shared by UI preview and the repository. */
import type { Break, BreakType, LocalDate, LocalTime, Shift, ShiftStatus, ShiftType } from "./types";
import { HOUR, resolveAfter, resolveRange, timeOf } from "./time.ts";
import { generateDates, type RepeatPattern } from "./recurrence";

export interface BreakDraft {
  id?: string;
  startTime: LocalTime;
  endTime: LocalTime;
  type: BreakType;
  isPaid: boolean;
}

export interface ShiftDraft {
  id?: string;
  date: LocalDate;
  startTime: LocalTime;
  endTime: LocalTime;
  hourlyRate: number | null;
  shiftType: ShiftType;
  notes: string;
  /** null = decide automatically from the time range. */
  status: ShiftStatus | null;
  breaks: BreakDraft[];
  repeat: RepeatPattern;
  repeatUntil: LocalDate;
}

export type DraftError = "breakOutside" | "breakOrder" | "tooLong" | "badRate";

export interface DraftResult {
  shift: Shift;
  breaks: Break[];
}

export function autoStatus(start: number, end: number, now: number): ShiftStatus {
  // a range still in the future (or not yet over) is a plan the user can clock into
  void start;
  return end <= now ? "completed" : "planned";
}

/** Build the entity for one date. `existing` keeps id/createdAt/planned values when editing. */
export function draftToEntities(
  draft: ShiftDraft,
  date: LocalDate,
  profileId: string,
  now: number,
  existing: Shift | null,
  newId: () => string,
): DraftResult | { error: DraftError } {
  if (draft.hourlyRate !== null && (!Number.isFinite(draft.hourlyRate) || draft.hourlyRate < 0)) return { error: "badRate" };
  const isActive = existing?.status === "active";
  const range = resolveRange(date, draft.startTime, draft.endTime);
  if (range.end - range.start > 24 * HOUR) return { error: "tooLong" };
  const status: ShiftStatus = isActive ? "active" : (draft.status ?? autoStatus(range.start, range.end, now));
  const endTs = isActive ? null : range.end;
  const id = existing?.id ?? newId();
  const breaks: Break[] = [];
  for (const b of draft.breaks) {
    const bs = resolveAfter(range.start, b.startTime);
    const be = resolveAfter(bs, b.endTime);
    if (be <= bs) return { error: "breakOrder" };
    if (bs < range.start || (endTs !== null && be > endTs)) return { error: "breakOutside" };
    breaks.push({ id: b.id ?? newId(), shiftId: id, startTimestamp: bs, endTimestamp: be, type: b.type, isPaid: b.isPaid });
  }
  const keepPlanned = existing && existing.plannedStartTimestamp !== null && status !== "planned";
  const shift: Shift = {
    id,
    profileId: existing?.profileId ?? profileId,
    date,
    startTimestamp: range.start,
    endTimestamp: endTs,
    plannedStartTimestamp: status === "planned" ? range.start : keepPlanned ? existing.plannedStartTimestamp : null,
    plannedEndTimestamp: status === "planned" ? range.end : keepPlanned ? existing.plannedEndTimestamp : null,
    hourlyRate: draft.hourlyRate,
    status,
    notes: draft.notes.trim(),
    shiftType: draft.shiftType,
    seriesId: existing?.seriesId ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return { shift, breaks };
}

/** Expand a draft into all occurrences (recurrence applies to new shifts only). */
export function draftDates(draft: ShiftDraft): LocalDate[] {
  return draft.id ? [draft.date] : generateDates(draft.date, draft.repeat, draft.repeatUntil);
}

export function shiftToDraft(shift: Shift, breaks: Break[], forCopy: boolean): ShiftDraft {
  const end = shift.endTimestamp ?? shift.plannedEndTimestamp ?? Date.now();
  return {
    id: forCopy ? undefined : shift.id,
    date: shift.date,
    startTime: timeOf(shift.startTimestamp),
    endTime: timeOf(end),
    hourlyRate: shift.hourlyRate,
    shiftType: shift.shiftType,
    notes: shift.notes,
    status: forCopy || shift.status === "active" ? null : shift.status,
    breaks: breaks
      .filter((b) => b.endTimestamp !== null)
      .map((b) => ({
        id: forCopy ? undefined : b.id,
        startTime: timeOf(b.startTimestamp),
        endTime: timeOf(b.endTimestamp as number),
        type: b.type,
        isPaid: b.isPaid,
      })),
    repeat: "none",
    repeatUntil: shift.date,
  };
}
