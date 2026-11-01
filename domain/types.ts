/** Calendar date in the user's local time zone, `YYYY-MM-DD`. Never derived from UTC. */
export type LocalDate = string;
/** Wall-clock time `HH:mm`. */
export type LocalTime = string;

export const SHIFT_STATUSES = ["planned", "active", "completed", "cancelled"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const SHIFT_TYPES = ["standard", "night", "weekend", "overtime", "custom"] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export const BREAK_TYPES = ["lunch", "short", "personal", "other"] as const;
export type BreakType = (typeof BREAK_TYPES)[number];

export interface Shift {
  id: string;
  profileId: string;
  /** Local calendar date the shift starts on. */
  date: LocalDate;
  /** Epoch ms — source of truth for every duration. */
  startTimestamp: number;
  /** Epoch ms; null while the shift is active. */
  endTimestamp: number | null;
  plannedStartTimestamp: number | null;
  plannedEndTimestamp: number | null;
  /** Overrides the profile rate when set. */
  hourlyRate: number | null;
  status: ShiftStatus;
  notes: string;
  shiftType: ShiftType;
  seriesId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Break {
  id: string;
  shiftId: string;
  startTimestamp: number;
  endTimestamp: number | null;
  type: BreakType;
  isPaid: boolean;
}

export interface ProfileSettings {
  /** Daily threshold after which worked time counts as overtime (0 = off). */
  overtimeThresholdHours: number;
  nightBonusPercent: number;
  nightStartHour: number;
  nightEndHour: number;
  weekendBonusPercent: number;
  paidBreaksByDefault: boolean;
  defaultStartTime: LocalTime;
  defaultEndTime: LocalTime;
  defaultShiftType: ShiftType;
}

export interface WorkProfile {
  id: string;
  name: string;
  hourlyRate: number;
  currency: string;
  overtimeMultiplier: number;
  settings: ProfileSettings;
}

export type ThemeMode = "light" | "dark" | "system";
export type Language = "ru" | "en";
export type TimeFormat = "24h" | "12h";

export interface Settings {
  id: "app";
  theme: ThemeMode;
  language: Language;
  currency: string;
  timeFormat: TimeFormat;
  weekStartsOn: 0 | 1;
  notificationsEnabled: boolean;
  seedColor: string;
  activeProfileId: string;
}

export interface BackupPayload {
  app: "shift-tracker";
  schemaVersion: number;
  exportedAt: number;
  settings: Settings | null;
  profiles: WorkProfile[];
  shifts: Shift[];
  breaks: Break[];
}

export interface BackupRecord {
  id: string;
  createdAt: number;
  label: string;
  shiftCount: number;
  data: BackupPayload;
}

export const DEFAULT_PROFILE_ID = "default";

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  overtimeThresholdHours: 8,
  nightBonusPercent: 20,
  nightStartHour: 22,
  nightEndHour: 6,
  weekendBonusPercent: 0,
  paidBreaksByDefault: false,
  defaultStartTime: "09:00",
  defaultEndTime: "18:00",
  defaultShiftType: "standard",
};

export function makeDefaultProfile(id = DEFAULT_PROFILE_ID, name = "Основная работа"): WorkProfile {
  return {
    id,
    name,
    hourlyRate: 500,
    currency: "RUB",
    overtimeMultiplier: 1.5,
    settings: { ...DEFAULT_PROFILE_SETTINGS },
  };
}

export const DEFAULT_SETTINGS: Settings = {
  id: "app",
  theme: "system",
  language: "ru",
  currency: "RUB",
  timeFormat: "24h",
  weekStartsOn: 1,
  notificationsEnabled: false,
  seedColor: "#1A5CE5",
  activeProfileId: DEFAULT_PROFILE_ID,
};

export const CURRENCIES = ["RUB", "USD", "EUR", "KZT", "BYN", "UAH", "GBP"] as const;
