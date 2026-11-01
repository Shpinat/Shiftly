import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, CalendarDays, CloudOff, Languages, Moon, Plus, Settings as SettingsIcon, SunMedium, SunMoon, Timer } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useActiveShift, useBootstrap, useNow, useOnline } from "@/hooks/useApp";
import { useAppStore, useUiStore } from "@/store/appStore";
import { translate, useT, type TKey } from "@/lib/i18n";
import { updateSettings } from "@/data/repo";
import { fmtClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IconButton } from "./m3";
import { ShiftEditor } from "./ShiftEditor";

const TABS: { to: string; key: TKey; icon: typeof Timer; testId: string }[] = [
  { to: "/", key: "navDashboard", icon: Timer, testId: "nav-tab-dashboard" },
  { to: "/calendar", key: "navCalendar", icon: CalendarDays, testId: "nav-tab-calendar" },
  { to: "/stats", key: "navStats", icon: BarChart3, testId: "nav-tab-stats" },
  { to: "/settings", key: "navSettings", icon: SettingsIcon, testId: "nav-tab-settings" },
];

const TITLES: Record<string, TKey> = { "/": "appName", "/calendar": "navCalendar", "/stats": "navStats", "/settings": "navSettings", "/history": "history" };

function ActiveChip() {
  const t = useT();
  const active = useActiveShift();
  const breaks = useAppStore((s) => s.breaks);
  const now = useNow(1000, active !== null);
  if (!active) return null;
  const onBreak = breaks.some((b) => b.shiftId === active.id && b.endTimestamp === null);
  return (
    <NavLink
      to="/"
      data-testid="header-active-chip"
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-bold",
        onBreak ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
      )}
    >
      <span className={cn("size-2 rounded-full animate-breathe", onBreak ? "bg-warning" : "bg-success")} />
      <span className="hidden sm:inline">{onBreak ? t("onBreak") : t("working")}</span>
      <span className="font-mono tabular">{fmtClock(now - active.startTimestamp)}</span>
    </NavLink>
  );
}

/** Fires one system notification when the running shift passes its planned end. */
function usePlannedEndNotification() {
  const active = useActiveShift();
  const enabled = useAppStore((s) => s.settings.notificationsEnabled);
  const lang = useAppStore((s) => s.settings.language);
  const now = useNow(30_000, enabled && active !== null);
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !active?.plannedEndTimestamp || !("Notification" in window) || Notification.permission !== "granted") return;
    if (now >= active.plannedEndTimestamp && notified.current !== active.id) {
      notified.current = active.id;
      new Notification("Shift Tracker", { body: translate(lang, "shiftEndNotification"), icon: "/pwa-192x192.png" });
    }
  }, [now, active, enabled, lang]);
}

export default function AppShell() {
  useBootstrap();
  usePlannedEndNotification();
  const t = useT();
  const online = useOnline();
  const { pathname } = useLocation();
  const settings = useAppStore((s) => s.settings);
  const error = useAppStore((s) => s.error);
  const openCreate = useUiStore((s) => s.openCreate);
  const themeNext = { light: "dark", dark: "system", system: "light" } as const;
  const ThemeIcon = settings.theme === "light" ? SunMedium : settings.theme === "dark" ? Moon : SunMoon;

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      {/* Navigation rail (≥ md) */}
      <nav aria-label="primary" className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center gap-3 bg-surface-container-low py-5 md:flex">
        <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary text-on-primary" aria-hidden>
          <Timer className="size-6" />
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          data-testid="rail-fab-add-shift"
          aria-label={t("addShiftLong")}
          className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container shadow-md transition-[box-shadow,transform] duration-200 ease-m3 hover:shadow-lg active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="size-6" />
        </button>
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} data-testid={`rail-${tab.testId}`} className="group flex w-full flex-col items-center gap-1 focus-visible:outline-none">
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-[background-color] duration-300 ease-m3 group-focus-visible:ring-2 group-focus-visible:ring-primary",
                    isActive ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant group-hover:bg-on-surface/8",
                  )}
                >
                  <tab.icon className="size-5" />
                </span>
                <span className={cn("text-xs", isActive ? "font-bold text-on-surface" : "font-medium text-on-surface-variant")}>{t(tab.key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="md:pl-[88px]">
        <header data-testid="app-header" className="sticky top-0 z-20 bg-surface/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 sm:px-6">
            <h1 className="min-w-0 flex-1 truncate text-[22px] font-bold tracking-tight" data-testid="app-title">
              {t(TITLES[pathname] ?? "appName")}
            </h1>
            {!online && (
              <span data-testid="offline-chip" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-container-highest px-3 text-xs font-semibold text-on-surface-variant">
                <CloudOff className="size-4" /> {t("offline")}
              </span>
            )}
            <ActiveChip />
            <IconButton
              label={t("language")}
              data-testid="lang-toggle-btn"
              onClick={() => void updateSettings({ language: settings.language === "ru" ? "en" : "ru" })}
              className="relative"
            >
              <Languages />
              <span className="absolute bottom-1.5 right-1.5 text-[9px] font-bold uppercase">{settings.language}</span>
            </IconButton>
            <IconButton label={t("theme")} data-testid="theme-toggle-btn" onClick={() => void updateSettings({ theme: themeNext[settings.theme] })}>
              <ThemeIcon />
            </IconButton>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pb-36 pt-2 sm:px-6 md:pb-12">
          {error && (
            <div role="alert" data-testid="db-error" className="mb-4 rounded-2xl bg-error-container p-4 text-sm text-on-error-container">
              {t("dbError")}: {error}
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {/* FAB (mobile) */}
      <button
        type="button"
        onClick={() => openCreate()}
        data-testid="fab-add-shift"
        aria-label={t("addShiftLong")}
        className="fixed bottom-[96px] right-4 z-30 flex h-14 items-center gap-2 rounded-2xl bg-primary-container pl-4 pr-5 font-bold text-on-primary-container shadow-lg transition-[box-shadow,transform] duration-200 ease-m3 hover:shadow-xl active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
      >
        <Plus className="size-6" /> {t("addShift")}
      </button>

      {/* Navigation bar (< md) */}
      <nav aria-label="primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant/40 bg-surface-container pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto grid h-20 max-w-md grid-cols-4">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} data-testid={tab.testId} className="group flex flex-col items-center justify-center gap-1 focus-visible:outline-none">
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-8 w-16 items-center justify-center rounded-full transition-[background-color,width] duration-300 ease-m3 group-focus-visible:ring-2 group-focus-visible:ring-primary",
                      isActive ? "bg-secondary-container text-on-secondary-container" : "w-12 text-on-surface-variant",
                    )}
                  >
                    <tab.icon className="size-5" />
                  </span>
                  <span className={cn("text-xs", isActive ? "font-bold text-on-surface" : "font-medium text-on-surface-variant")}>{t(tab.key)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <ShiftEditor />
      <Toaster position="bottom-center" offset={104} mobileOffset={104} toastOptions={{ className: "!rounded-xl !bg-inverse-surface !text-inverse-on-surface !border-none" }} />
    </div>
  );
}
