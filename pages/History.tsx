import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Coffee, History, Play, Plus, Square, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActiveShift, useMetrics, useNow, runAction } from "@/hooks/useApp";
import { useAppStore, useUiStore } from "@/store/appStore";
import { BREAK_LABELS, SHIFT_TYPE_LABELS, useT } from "@/lib/i18n";
import { fmtClock, fmtDate, fmtDuration, fmtHours, fmtMoney, fmtTime } from "@/lib/format";
import { endBreak, endShift, resumeShift, startBreak, startShift } from "@/data/repo";
import { BREAK_TYPES, type BreakType } from "@/domain/types";
import { periodRange, totals, upcoming } from "@/domain/stats";
import { toLocalDate } from "@/domain/time";
import { EmptyState, M3Button, SectionTitle, Surface, TYPE_DOT } from "@/components/m3";
import { cn } from "@/lib/utils";

function greetingKey(h: number) {
  return h < 5 ? "greetingNight" : h < 12 ? "greetingMorning" : h < 18 ? "greetingDay" : "greetingEvening";
}

function useShiftActions() {
  const t = useT();
  const profile = useAppStore((s) => s.profile);
  const setLastFinished = useUiStore((s) => s.setLastFinished);
  const vibrate = () => navigator.vibrate?.(15);
  return {
    start: async () => {
      const s = await runAction(() => startShift(profile));
      if (s) {
        vibrate();
        setLastFinished(null);
        toast.success(t("shiftStartedToast"));
      }
    },
    end: async (id: string) => {
      const s = await runAction(() => endShift(id));
      if (s) {
        vibrate();
        setLastFinished(s.id);
        toast(t("shiftEndedToast"), {
          action: {
            label: t("undo"),
            onClick: () => void runAction(() => resumeShift(s.id)).then(() => setLastFinished(null)),
          },
        });
      }
    },
    startBreak: async (id: string, type: BreakType) => {
      const b = await runAction(() => startBreak(id, type, profile.settings.paidBreaksByDefault));
      if (b) toast(t("breakStartedToast"));
    },
    endBreak: async (id: string) => {
      const ok = await runAction(() => endBreak(id).then(() => true));
      if (ok) toast(t("breakEndedToast"));
    },
  };
}

function BreakMenu({ shiftId, variant, testId }: { shiftId: string; variant: "hero" | "tonal"; testId: string }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const actions = useShiftActions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid={testId}
        className={cn(
          "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-[background-color,transform] duration-200 ease-m3 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          variant === "hero" ? "bg-on-primary/15 text-on-primary hover:bg-on-primary/25 focus-visible:ring-on-primary" : "bg-secondary-container text-on-secondary-container focus-visible:ring-primary",
        )}
      >
        <Coffee className="size-[18px]" /> {t("startBreak")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48 rounded-2xl bg-surface-container-high p-1.5">
        {BREAK_TYPES.map((bt) => (
          <DropdownMenuItem key={bt} className="min-h-12 rounded-xl text-[15px]" data-testid={`break-type-${bt}`} onClick={() => void actions.startBreak(shiftId, bt)}>
            {BREAK_LABELS[lang][bt]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="truncate font-mono text-base font-bold tabular" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

function CurrentShiftCard() {
  const t = useT();
  const active = useActiveShift();
  const { settings, profile, shifts } = useAppStore();
  const lastFinishedId = useUiStore((s) => s.lastFinishedId);
  const setLastFinished = useUiStore((s) => s.setLastFinished);
  const now = useNow(1000, true);
  const metrics = useMetrics(now);
  const actions = useShiftActions();
  const lang = settings.language;
  const tf = settings.timeFormat;
  const finished = !active && lastFinishedId ? shifts.find((s) => s.id === lastFinishedId) : undefined;
  const next = upcoming(shifts, now, 1)[0];

  if (active) {
    const m = metrics.get(active.id);
    if (!m) return null;
    const open = m.openBreak;
    return (
      <section data-testid="current-shift-card" data-state={open ? "break" : "active"} className="relative overflow-hidden rounded-[28px] bg-primary p-6 text-on-primary shadow-md animate-rise">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-on-primary/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 right-10 size-48 rounded-full bg-on-primary/5" aria-hidden />
        <div className="relative flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-on-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-wider" data-testid="shift-state-badge">
            <span className={cn("size-2 rounded-full animate-breathe", open ? "bg-warning" : "bg-on-primary")} />
            {open ? `${t("onBreak")} · ${BREAK_LABELS[lang][open.type]}` : t("working")}
          </span>
          <span className="text-xs opacity-80">{SHIFT_TYPE_LABELS[lang][active.shiftType]}</span>
        </div>
        <p className="relative mt-4 text-sm opacity-85">{open ? t("breakTimer") : t("duration")}</p>
        <p className="relative font-mono text-[52px] font-bold leading-none tracking-tight tabular sm:text-[64px]" data-testid="timer-display" aria-live="off">
          {fmtClock(open ? now - open.startTimestamp : m.totalMs)}
        </p>
        <div className="relative mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t("shiftStartedAt")} value={fmtTime(active.startTimestamp, tf)} testId="active-start-time" />
          <Stat label={t("plannedEnd")} value={active.plannedEndTimestamp ? fmtTime(active.plannedEndTimestamp, tf) : "—"} testId="active-planned-end" />
          <Stat label={open ? t("shiftDuration") : t("worked")} value={open ? fmtClock(m.totalMs) : fmtDuration(m.workedMs, lang)} testId="active-worked" />
          <Stat label={t("estEarnings")} value={fmtMoney(m.totalPay, profile.currency, lang)} testId="active-earnings" />
        </div>
        <div className="relative mt-6 flex flex-wrap gap-2">
          {open ? (
            <M3Button className="flex-1 bg-on-primary text-primary hover:bg-on-primary/90" onClick={() => void actions.endBreak(active.id)} data-testid="btn-end-break">
              <Play /> {t("endBreak")}
            </M3Button>
          ) : (
            <BreakMenu shiftId={active.id} variant="hero" testId="btn-start-break" />
          )}
          <M3Button className="flex-1 bg-on-primary text-primary hover:bg-on-primary/90" onClick={() => void actions.end(active.id)} data-testid="btn-end-shift">
            <Square /> {t("endShift")}
          </M3Button>
        </div>
      </section>
    );
  }

  if (finished) {
    const m = metrics.get(finished.id);
    return (
      <section data-testid="current-shift-card" data-state="finished" className="rounded-[28px] bg-tertiary-container p-6 text-on-tertiary-container animate-rise">
        <span className="rounded-full bg-on-tertiary-container/10 px-3 py-1 text-xs font-bold uppercase tracking-wider">{t("summary")}</span>
        <h2 className="mt-3 text-2xl font-bold tracking-tight">{t("shiftFinished")}</h2>
        {m && (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t("duration")} value={fmtDuration(m.totalMs, lang)} testId="finished-total" />
            <Stat label={t("worked")} value={fmtDuration(m.workedMs, lang)} testId="finished-worked" />
            <Stat label={t("breaks")} value={fmtDuration(m.breakMs, lang)} testId="finished-breaks" />
            <Stat label={t("earnings")} value={fmtMoney(m.totalPay, profile.currency, lang)} testId="finished-earnings" />
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <M3Button onClick={() => void actions.start()} data-testid="btn-start-new-shift">
            <Play /> {t("newShift")}
          </M3Button>
          <M3Button variant="text" className="text-on-tertiary-container" onClick={() => setLastFinished(null)} data-testid="btn-dismiss-summary">
            {t("close")}
          </M3Button>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="current-shift-card" data-state="idle" className="relative overflow-hidden rounded-[28px] bg-primary-container p-6 text-on-primary-container animate-rise">
      <div className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full bg-primary/10" aria-hidden />
      <p className="relative text-sm font-semibold capitalize opacity-80" data-testid="idle-date">
        {fmtDate(toLocalDate(now), lang, "EEEE, d MMMM")}
      </p>
      <h2 className="relative mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl" data-testid="idle-greeting">
        {t(greetingKey(new Date(now).getHours()))}
      </h2>
      <p className="relative mt-1 text-sm opacity-80">{t("readyToStart")}</p>
      <div className="relative mt-4 rounded-2xl bg-surface/60 p-3 text-sm" data-testid="idle-next-shift">
        {next ? (
          <>
            <span className="opacity-75">{t("nextShift")}: </span>
            <b className="capitalize">
              {fmtDate(next.date, lang)} · {fmtTime(next.startTimestamp, settings.timeFormat)}
            </b>
          </>
        ) : (
          <span className="opacity-75">{t("noUpcoming")}</span>
        )}
      </div>
      <M3Button className="relative mt-5 h-14 w-full text-base sm:w-auto sm:px-10" onClick={() => void actions.start()} data-testid="btn-start-shift">
        <Play /> {t("startShift")}
      </M3Button>
    </section>
  );
}

function QuickActions() {
  const t = useT();
  const active = useActiveShift();
  const breaks = useAppStore((s) => s.breaks);
  const openCreate = useUiStore((s) => s.openCreate);
  const actions = useShiftActions();
  const onBreak = active ? breaks.some((b) => b.shiftId === active.id && b.endTimestamp === null) : false;
  return (
    <section aria-label={t("quickActions")}>
      <SectionTitle>{t("quickActions")}</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {active ? (
          <M3Button variant="tonal" onClick={() => void actions.end(active.id)} data-testid="quick-end-shift">
            <Square /> {t("endShift")}
          </M3Button>
        ) : (
          <M3Button variant="tonal" onClick={() => void actions.start()} data-testid="quick-start-shift">
            <Play /> {t("startShift")}
          </M3Button>
        )}
        {active && onBreak && (
          <M3Button variant="tonal" onClick={() => void actions.endBreak(active.id)} data-testid="quick-end-break">
            <TimerReset /> {t("endBreak")}
          </M3Button>
        )}
        {active && !onBreak && <BreakMenu shiftId={active.id} variant="tonal" testId="quick-start-break" />}
        <M3Button variant="outlined" onClick={() => openCreate()} data-testid="btn-quick-add-shift">
          <Plus /> {t("manualAdd")}
        </M3Button>
      </div>
    </section>
  );
}

function SummaryGrid() {
  const t = useT();
  const { shifts, settings, profile } = useAppStore();
  const now = useNow(30_000);
  const metrics = useMetrics(now);
  const lang = settings.language;
  const today = toLocalDate(now);
  const data = useMemo(() => {
    const day = totals(shifts, metrics, { from: today, to: today });
    const week = totals(shifts, metrics, periodRange("week", today, 0, settings.weekStartsOn));
    const month = totals(shifts, metrics, periodRange("month", today, 0, settings.weekStartsOn));
    return { day, week, month };
  }, [shifts, metrics, today, settings.weekStartsOn]);
  const items = [
    { label: t("today"), value: fmtHours(data.day.workedMs, lang), testId: "kpi-today-hours", tone: "bg-surface-container" },
    { label: t("week"), value: fmtHours(data.week.workedMs, lang), testId: "kpi-week-hours", tone: "bg-surface-container" },
    { label: t("month"), value: fmtHours(data.month.workedMs, lang), testId: "kpi-month-hours", tone: "bg-surface-container" },
    { label: t("shiftsCount"), value: String(data.month.count), testId: "kpi-month-shifts", tone: "bg-surface-container" },
    { label: t("overtime"), value: fmtHours(data.month.overtimeMs, lang), testId: "kpi-month-overtime", tone: "bg-tertiary-container text-on-tertiary-container" },
  ];
  return (
    <section>
      <SectionTitle>{t("overview")}</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-2 rounded-3xl bg-secondary-container p-4 text-on-secondary-container sm:col-span-3 lg:col-span-2 lg:row-span-2 lg:flex lg:flex-col lg:justify-between">
          <p className="text-xs font-semibold">{t("monthEarnings")}</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular" data-testid="kpi-month-earnings">
            {fmtMoney(data.month.pay, profile.currency, lang)}
          </p>
          <p className="mt-1 text-xs opacity-80" data-testid="kpi-week-earnings">
            {fmtMoney(data.week.pay, profile.currency, lang)} {t("weekEarnings")}
            {data.month.overtimePay + data.month.extraPay > 0 && ` · ${t("extraPay")} ${fmtMoney(data.month.overtimePay + data.month.extraPay, profile.currency, lang)}`}
          </p>
        </div>
        {items.map((it) => (
          <div key={it.testId} className={cn("rounded-3xl p-4", it.tone)}>
            <p className="text-xs font-medium opacity-80">{it.label}</p>
            <p className="mt-1 font-mono text-xl font-bold tabular" data-testid={it.testId}>
              {it.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Upcoming() {
  const t = useT();
  const { shifts, settings } = useAppStore();
  const openCreate = useUiStore((s) => s.openCreate);
  const openEdit = useUiStore((s) => s.openEdit);
  const now = useNow(60_000);
  const list = upcoming(shifts, now, 4);
  const lang = settings.language;
  return (
    <section>
      <SectionTitle
        action={
          <Link to="/calendar" className="inline-flex min-h-12 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary/8" data-testid="link-open-calendar">
            {t("openCalendar")} <ArrowRight className="size-4" />
          </Link>
        }
      >
        {t("upcoming")}
      </SectionTitle>
      {list.length === 0 ? (
        <EmptyState
          testId="upcoming-empty"
          icon={<Plus />}
          title={t("noUpcoming")}
          action={
            <M3Button variant="tonal" onClick={() => openCreate()} data-testid="upcoming-add-btn">
              <Plus /> {t("addShiftLong")}
            </M3Button>
          }
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => openEdit(s.id)}
                data-testid={`upcoming-shift-${s.id}`}
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-surface-container p-3 text-left transition-colors duration-200 ease-m3 hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className={cn("h-10 w-1.5 rounded-full", TYPE_DOT[s.shiftType])} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold capitalize">{fmtDate(s.date, lang, "EEEE, d MMM")}</span>
                  <span className="block font-mono text-sm text-on-surface-variant tabular">
                    {fmtTime(s.startTimestamp, settings.timeFormat)} – {s.endTimestamp ? fmtTime(s.endTimestamp, settings.timeFormat) : ""}
                  </span>
                </span>
                <span className="rounded-full bg-surface-container-highest px-2.5 py-1 text-xs font-semibold text-on-surface-variant">{SHIFT_TYPE_LABELS[lang][s.shiftType]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Dashboard() {
  const t = useT();
  const ready = useAppStore((s) => s.ready);
  return (
    <div className="flex flex-col gap-7">
      {ready ? <CurrentShiftCard /> : <div className="h-64 animate-pulse rounded-[28px] bg-surface-container" aria-label={t("loading")} data-testid="dashboard-loading" />}
      <QuickActions />
      <SummaryGrid />
      <Upcoming />
      <Surface tone="outlined" className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary-container text-on-secondary-container">
            <History className="size-5" />
          </div>
          <p className="font-semibold">{t("history")}</p>
        </div>
        <Link to="/history" className="inline-flex min-h-12 items-center gap-1 rounded-full px-4 text-sm font-semibold text-primary hover:bg-primary/8" data-testid="link-open-history">
          {t("allShifts")} <ArrowRight className="size-4" />
        </Link>
      </Surface>
    </div>
  );
}
