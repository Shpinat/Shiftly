import type { BackupPayload, BackupRecord } from "@/domain/types";
import { SCHEMA_VERSION, duplicateKey, validatePayload } from "@/domain/backup";
import { db } from "./db";
import { DomainError, ensureDefaults, newId } from "./repo";

export async function buildPayload(): Promise<BackupPayload> {
  const [settings, profiles, shifts, breaks] = await Promise.all([
    db.settings.get("app"),
    db.profiles.toArray(),
    db.shifts.toArray(),
    db.breaks.toArray(),
  ]);
  return { app: "shift-tracker", schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), settings: settings ?? null, profiles, shifts, breaks };
}

export interface ImportResult {
  added: number;
  duplicates: number;
  invalid: number;
}

/**
 * Import a validated payload.
 * merge: keep existing data, add new profiles/shifts, skip duplicates (same id or same profile+start minute).
 * replace: wipe everything and load the payload.
 */
export async function importPayload(raw: unknown, mode: "merge" | "replace"): Promise<ImportResult> {
  const v = validatePayload(raw);
  if (!v.ok) throw new DomainError(v.error);
  const p = v.payload;
  const invalid = v.warnings.reduce((acc, w) => acc + Number(w.split(":")[1] ?? 0), 0);
  let added = 0;
  let duplicates = 0;
  await db.transaction("rw", [db.shifts, db.breaks, db.profiles, db.settings], async () => {
    if (mode === "replace") {
      await Promise.all([db.shifts.clear(), db.breaks.clear(), db.profiles.clear()]);
      if (p.settings) await db.settings.put(p.settings);
    }
    const existingProfiles = new Set((await db.profiles.toCollection().primaryKeys()) as string[]);
    await db.profiles.bulkPut(p.profiles.filter((pr) => !existingProfiles.has(pr.id)));
    const existing = await db.shifts.toArray();
    const ids = new Set(existing.map((s) => s.id));
    const keys = new Set(existing.map(duplicateKey));
    const profileIds = new Set([...existingProfiles, ...p.profiles.map((pr) => pr.id)]);
    const fallbackProfile = [...profileIds][0];
    const accepted = new Set<string>();
    for (const s of p.shifts) {
      const shift = profileIds.has(s.profileId) ? s : { ...s, profileId: fallbackProfile ?? s.profileId };
      if (ids.has(shift.id) || keys.has(duplicateKey(shift))) {
        duplicates += 1;
        continue;
      }
      // never import a second running shift for a profile
      if (shift.status === "active" && existing.some((e) => e.status === "active" && e.profileId === shift.profileId)) {
        duplicates += 1;
        continue;
      }
      ids.add(shift.id);
      keys.add(duplicateKey(shift));
      existing.push(shift);
      accepted.add(shift.id);
      await db.shifts.put(shift);
      added += 1;
    }
    await db.breaks.bulkPut(p.breaks.filter((b) => accepted.has(b.shiftId)));
  });
  await ensureDefaults();
  return { added, duplicates, invalid };
}

export async function createLocalBackup(label: string): Promise<BackupRecord> {
  const data = await buildPayload();
  const rec: BackupRecord = { id: newId(), createdAt: Date.now(), label, shiftCount: data.shifts.length, data };
  await db.backups.add(rec);
  // keep the 10 most recent snapshots
  const all = await db.backups.orderBy("createdAt").reverse().toArray();
  if (all.length > 10) await db.backups.bulkDelete(all.slice(10).map((b) => b.id));
  return rec;
}

export async function restoreLocalBackup(id: string): Promise<ImportResult> {
  const rec = await db.backups.get(id);
  if (!rec) throw new DomainError("notFound");
  return importPayload(rec.data, "replace");
}

export async function deleteLocalBackup(id: string): Promise<void> {
  await db.backups.delete(id);
}

export function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
