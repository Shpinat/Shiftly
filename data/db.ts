import Dexie, { type EntityTable } from "dexie";
import type { BackupRecord, Break, Settings, Shift, WorkProfile } from "@/domain/types";
import { DEFAULT_PROFILE_ID, DEFAULT_SETTINGS, makeDefaultProfile } from "@/domain/types";

export const DB_NAME = "shift-tracker";

/** v1 schema — kept verbatim so Dexie can migrate devices that installed the first release. */
export const SCHEMA_V1 = {
  shifts: "id, date, status, startTimestamp",
  breaks: "id, shiftId",
  profiles: "id",
  settings: "id",
};

/** v2: work profiles per shift, planned times, series, local backups. */
export const SCHEMA_V2 = {
  shifts: "id, profileId, date, status, startTimestamp, seriesId, [profileId+status]",
  backups: "id, createdAt",
};

export class ShiftDB extends Dexie {
  declare shifts: EntityTable<Shift, "id">;
  declare breaks: EntityTable<Break, "id">;
  declare profiles: EntityTable<WorkProfile, "id">;
  declare settings: EntityTable<Settings, "id">;
  declare backups: EntityTable<BackupRecord, "id">;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    this.version(2)
      .stores(SCHEMA_V2)
      .upgrade(async (tx) => {
        const profiles = tx.table<WorkProfile, string>("profiles");
        let profileId = (await profiles.toCollection().first())?.id;
        if (!profileId) {
          profileId = DEFAULT_PROFILE_ID;
          await profiles.put(makeDefaultProfile());
        }
        const pid = profileId;
        await tx
          .table("shifts")
          .toCollection()
          .modify((s: Record<string, unknown>) => {
            if (typeof s.profileId !== "string") s.profileId = pid;
            if (s.plannedStartTimestamp === undefined) s.plannedStartTimestamp = s.status === "planned" ? s.startTimestamp : null;
            if (s.plannedEndTimestamp === undefined) s.plannedEndTimestamp = s.status === "planned" ? (s.endTimestamp ?? null) : null;
            if (s.seriesId === undefined) s.seriesId = null;
            if (s.hourlyRate === undefined) s.hourlyRate = null;
            if (typeof s.notes !== "string") s.notes = "";
          });
        await tx
          .table("settings")
          .toCollection()
          .modify((s: Record<string, unknown>) => {
            if (typeof s.activeProfileId !== "string") s.activeProfileId = pid;
            if (typeof s.seedColor !== "string") s.seedColor = DEFAULT_SETTINGS.seedColor;
          });
      });
  }
}

export const db = new ShiftDB();
