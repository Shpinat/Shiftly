import { format } from "date-fns";
import { enUS, ru } from "date-fns/locale";
import type { Language, LocalDate, TimeFormat } from "@/domain/types";
import { parseLocalDate } from "@/domain/time";

export const dateLocale = (lang: Language) => (lang === "ru" ? ru : enUS);

export function fmtTime(ts: number, tf: TimeFormat): string {
  return format(new Date(ts), tf === "12h" ? "h:mm a" : "HH:mm");
}

export function fmtDate(date: LocalDate, lang: Language, pattern = "d MMM, EEEEEE"): string {
  return format(parseLocalDate(date), pattern, { locale: dateLocale(lang) });
}

/** HH:MM:SS for timers. */
export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export function fmtDuration(ms: number, lang: Language): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const [hu, mu] = lang === "ru" ? ["ч", "мин"] : ["h", "m"];
  if (h === 0) return `${m} ${mu}`;
  return m === 0 ? `${h} ${hu}` : `${h} ${hu} ${m} ${mu}`;
}

export function fmtHours(ms: number, lang: Language): string {
  const v = ms / 3_600_000;
  return `${v.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 1 })} ${lang === "ru" ? "ч" : "h"}`;
}

export function fmtMoney(amount: number, currency: string, lang: Language, compact = false): string {
  try {
    return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: compact || Math.abs(amount) >= 1000 ? 0 : 2,
      notation: compact && Math.abs(amount) >= 100_000 ? "compact" : "standard",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
