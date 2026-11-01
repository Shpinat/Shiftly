import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";
import { toast } from "sonner";
import { db } from "@/data/db";
import { DomainError, ensureDefaults } from "@/data/repo";
import { useAppStore } from "@/store/appStore";
import { applyTheme } from "@/lib/theme";
import { computeAll } from "@/domain/earnings";
import { translate, type TKey } from "@/lib/i18n";

/** Re-render tick. Never a source of truth: durations are always `now - timestamp`. */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [intervalMs, enabled]);
  return now;
}

/** Subscribes the app store to IndexedDB. Mounted once in the app shell. */
export function useBootstrap(): void {
  const profileId = useAppStore((s) => s.settings.activeProfileId);
  const ready = useAppStore((s) => s.ready);

  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe: () => void } | null = null;
    ensureDefaults()
      .then(() => {
        if (cancelled) return;
        sub = liveQuery(async () => ({ settings: await db.settings.get("app"), profiles: await db.profiles.toArray() })).subscribe({
          next: ({ settings, profiles }) => {
            if (!settings) return;
            const profile = profiles.find((p) => p.id === settings.activeProfileId) ?? profiles[0];
            if (!profile) return;
            useAppStore.setState({ settings, profiles, profile });
          },
          error: (e: unknown) => useAppStore.setState({ error: String(e) }),
        });
      })
      .catch((e: unknown) => useAppStore.setState({ error: String(e), ready: true }));
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const shifts = await db.shifts.where("profileId").equals(profileId).toArray();
      const ids = shifts.map((s) => s.id);
      const breaks = ids.length ? await db.breaks.where("shiftId").anyOf(ids).toArray() : [];
      return { shifts, breaks };
    }).subscribe({
      next: ({ shifts, breaks }) => useAppStore.setState({ shifts, breaks, ready: true }),
      error: (e: unknown) => useAppStore.setState({ error: String(e), ready: true }),
    });
    return () => sub.unsubscribe();
  }, [profileId]);

  const theme = useAppStore((s) => s.settings.theme);
  const seed = useAppStore((s) => s.settings.seedColor);
  const lang = useAppStore((s) => s.settings.language);
  useEffect(() => {
    applyTheme(theme, seed);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(theme, seed);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, seed]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  void ready;
}

export function useActiveShift() {
  const shifts = useAppStore((s) => s.shifts);
  return useMemo(() => shifts.find((s) => s.status === "active") ?? null, [shifts]);
}

/** Metrics for every shift of the active profile, recomputed at `now`. */
export function useMetrics(now: number) {
  const shifts = useAppStore((s) => s.shifts);
  const breaks = useAppStore((s) => s.breaks);
  const profile = useAppStore((s) => s.profile);
  return useMemo(() => computeAll(shifts, breaks, profile, now), [shifts, breaks, profile, now]);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Run a data action and report errors through the snackbar. */
export async function runAction<T>(fn: () => Promise<T>): Promise<T | undefined> {
  const lang = useAppStore.getState().settings.language;
  try {
    return await fn();
  } catch (e) {
    const key = e instanceof DomainError ? (`err_${e.code}` as TKey) : "errorGeneric";
    toast.error(translate(lang, key) === key ? translate(lang, "errorGeneric") : translate(lang, key));
    if (!(e instanceof DomainError)) console.error(e);
    return undefined;
  }
}
