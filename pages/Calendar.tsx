import { useMemo, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMetrics, useNow } from "@/hooks/useApp";
import { useAppStore, useUiStore } from "@/store/appStore";
import { SHIFT_TYPE_LABELS, useT } from "@/lib/i18n";
import { dateLocale, fmtDate, fmtDuration, fmtMoney, fmtTime } from "@/lib/format";
import { SHIFT_TYPES, type LocalDate, type Shift } from "@/domain/types";
import { parseLocalDate, toLocalDate } from "@/domain/time";
import { totals } from "@/domain/stats";
import { EmptyState, IconButton, M3Button, Segmented, TYPE_CONTAINER, TYPE_DOT } from "@/components/m3";
import { ShiftListItem } from "@/components/ShiftListItem";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Mode = "month" | "week";

export default function CalendarPage() {
  const t = useT();
  const { shifts, settings, profile } = useAppStore();
  const openCreate = useUiStore((s) => s.openCreate);
  const lang = settings.language;
  const ws = settings.weekStartsOn;
  const now = useNow(60_000);
  const metrics = useMetrics(now);
  const today = toLocalDate(now);
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState<LocalDate>(today);
  const [selected, setSelected] = useState<LocalDate | null>(null);
  const [focusDate, setFocusDate] = useState<LocalDate>(today);

  const byDate = useMemo(() => {
    const map = new Map<LocalDate, Shift[]>();
    for (const s of shifts) {
      const list = map.get(s.date);
      if (list) list.push(s);
      else map.set(s.date, [s]);
    }
    for (const l of map.values()) l.sort((a, b) => a.startTimestamp - b.startTimestamp);
    return map;
  }, [shifts]);

  const c = parseLocalDate(cursor);
  const days = useMemo(() => {
    const range =
      mode === "month"
        ? { start: startOfWeek(startOfMonth(c), { weekStartsOn: ws }), end: endOfWeek(endOfMonth(c), { weekStartsOn: ws }) }
        : { start: startOfWeek(c, { weekStartsOn: ws }), end: endOfWeek(c, { weekStartsOn: ws }) };
    return eachDayOfInterval(range).map((d) => toLocalDate(d.getTime()));
  }, [cursor, mode, ws]);

  const weekdayNames = days.slice(0, 7).map((d) => format(parseLocalDate(d), "EEEEEE", { locale: dateLocale(lang) }));
  const title =
    mode === "month"
      ? format(c, "LLLL yyyy", { locale: dateLocale(lang) })
      : `${fmtDate(days[0], lang, "d MMM")} – ${fmtDate(days[6], lang, "d MMM yyyy")}`;

  const shift = (dir: number) => setCursor(toLocalDate((mode === "month" ? addMonths(c, dir) : addWeeks(c, dir)).getTime()));

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const d = deltas[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const idx = days.indexOf(focusDate);
    const nextIdx = Math.min(days.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + d));
    const next = days[nextIdx];
    setFocusDate(next);
    document.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus();
  };

  const daySummary = (d: LocalDate) => totals(byDate.get(d) ?? [], metrics, null);
  const selectedShifts = selected ? (byDate.get(selected) ?? []) : [];
  const selTotals = selected ? daySummary(selected) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <IconButton label={t("prev")} onClick={() => shift(-1)} data-testid="calendar-prev">
            <ChevronLeft />
          </IconButton>
          <h2 className="min-w-0 truncate text-lg font-bold capitalize" data-testid="calendar-title">
            {title}
          </h2>
          <IconButton label={t("next")} onClick={() => shift(1)} data-testid="calendar-next">
            <ChevronRight />
          </IconButton>
        </div>
        <M3Button variant="outlined" className="min-h-10 px-4" onClick={() => setCursor(today)} data-testid="calendar-today">
          {t("goToday")}
        </M3Button>
        <Segmented<Mode>
          className="w-full sm:w-56"
          ariaLabel={t("navCalendar")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "month", label: t("monthView"), testId: "calendar-view-month" },
            { value: "week", label: t("weekView"), testId: "calendar-view-week" },
          ]}
        />
      </div>

      {mode === "month" ? (
        <div className="rounded-3xl bg-surface-container-low p-2 sm:p-3" data-testid="calendar-month-grid">
          <div className="grid grid-cols-7 pb-1">
            {weekdayNames.map((w) => (
              <div key={w} className="py-2 text-center text-xs font-semibold uppercase text-on-surface-variant">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1" role="grid" onKeyDown={onGridKey}>
            {days.map((d) => {
              const list = byDate.get(d) ?? [];
              const inMonth = isSameMonth(parseLocalDate(d), c);
              const isToday = d === today;
              const hours = daySummary(d).workedMs;
              return (
                <button
                  key={d}
                  type="button"
                  data-date={d}
                  data-testid={`calendar-day-${d}`}
                  tabIndex={d === focusDate || (!days.includes(focusDate) && d === days[0]) ? 0 : -1}
                  onFocus={() => setFocusDate(d)}
                  onClick={() => setSelected(d)}
                  aria-label={`${fmtDate(d, lang, "d MMMM")}${list.length ? `, ${list.length}` : ""}`}
                  className={cn(
                    "flex min-h-14 min-w-0 flex-col items-center gap-1 rounded-2xl px-0.5 pb-1.5 pt-1 transition-[background-color] duration-200 ease-m3 hover:bg-on-surface/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-20",
                    !inMonth && "opacity-40",
                  )}
                >
                  <span className={cn("flex size-8 items-center justify-center rounded-full text-sm font-semibold tabular", isToday ? "bg-primary text-on-primary" : "text-on-surface")}>
                    {parseLocalDate(d).getDate()}
                  </span>
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {list.slice(0, 4).map((s) => (
                      <span key={s.id} className={cn("size-1.5 rounded-full sm:size-2", TYPE_DOT[s.shiftType], s.status === "cancelled" && "opacity-30", s.status === "planned" && "ring-1 ring-surface")} />
                    ))}
                  </span>
                  {hours > 0 && <span className="hidden text-[10px] font-semibold text-on-surface-variant sm:block">{fmtDuration(hours, lang)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-testid="calendar-week-list" onKeyDown={onGridKey}>
          {days.map((d) => {
            const list = byDate.get(d) ?? [];
            const isToday = d === today;
            return (
              <div key={d} className={cn("flex gap-3 rounded-3xl p-3", isToday ? "bg-primary-container/60" : "bg-surface-container-low")}>
                <button
                  type="button"
                  data-date={d}
                  data-testid={`calendar-day-${d}`}
                  onFocus={() => setFocusDate(d)}
                  onClick={() => setSelected(d)}
                  className="flex w-14 shrink-0 flex-col items-center justify-center rounded-2xl py-2 hover:bg-on-surface/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="text-xs font-semibold uppercase text-on-surface-variant">{fmtDate(d, lang, "EEEEEE")}</span>
                  <span className={cn("mt-0.5 flex size-9 items-center justify-center rounded-full text-lg font-bold", isToday && "bg-primary text-on-primary")}>{parseLocalDate(d).getDate()}</span>
                </button>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                  {list.length === 0 ? (
                    <button type="button" onClick={() => openCreate(d)} className="flex min-h-12 items-center gap-2 rounded-xl px-2 text-sm text-on-surface-variant hover:bg-on-surface/5" data-testid={`week-add-${d}`}>
                      <Plus className="size-4" /> {t("addShiftLong")}
                    </button>
                  ) : (
                    list.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelected(d)}
                        className={cn("flex min-h-12 min-w-0 items-center gap-2 rounded-xl px-3 text-left text-sm text-on-surface", TYPE_CONTAINER[s.shiftType], s.status === "cancelled" && "line-through opacity-60")}
                        data-testid={`week-shift-${s.id}`}
                      >
                        <span className={cn("size-2.5 shrink-0 rounded-full", TYPE_DOT[s.shiftType])} />
                        <span className="font-mono font-semibold tabular">
                          {fmtTime(s.startTimestamp, settings.timeFormat)}–{fmtTime(s.endTimestamp ?? s.plannedEndTimestamp ?? now, settings.timeFormat)}
                        </span>
                        <span className="truncate text-xs opacity-80">{SHIFT_TYPE_LABELS[lang][s.shiftType]}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1" aria-label={t("legend")} data-testid="calendar-legend">
        {SHIFT_TYPES.map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className={cn("size-2.5 rounded-full", TYPE_DOT[st])} /> {SHIFT_TYPE_LABELS[lang][st]}
          </span>
        ))}
      </div>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="bottom" showCloseButton={false} className="mx-auto max-h-[85dvh] w-full max-w-2xl gap-0 overflow-y-auto rounded-t-[28px] border-none bg-surface-container-low p-0" data-testid="day-sheet">
          <div className="mx-auto mt-3 h-1 w-8 rounded-full bg-outline-variant" aria-hidden />
          {selected && (
            <div className="flex flex-col gap-4 px-5 pb-6 pt-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SheetTitle className="text-[22px] font-bold capitalize tracking-tight">{fmtDate(selected, lang, "EEEE, d MMMM")}</SheetTitle>
                  {selTotals && selTotals.count > 0 && (
                    <p className="mt-1 text-sm text-on-surface-variant" data-testid="day-sheet-totals">
                      {t("total")}: {fmtDuration(selTotals.workedMs, lang)} · {fmtMoney(selTotals.pay, profile.currency, lang)}
                    </p>
                  )}
                </div>
                <M3Button
                  variant="tonal"
                  data-testid="day-sheet-add-btn"
                  onClick={() => {
                    const d = selected;
                    setSelected(null);
                    openCreate(d);
                  }}
                >
                  <Plus /> {t("addShift")}
                </M3Button>
              </div>
              {selectedShifts.length === 0 ? (
                <EmptyState testId="day-sheet-empty" icon={<Plus />} title={t("noShiftsDay")} />
              ) : (
                <div className="flex flex-col gap-2" data-testid="day-sheet-list">
                  {selectedShifts.map((s) => (
                    <ShiftListItem key={s.id} shift={s} metrics={metrics.get(s.id)} showDate={false} onNavigate={() => setSelected(null)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
