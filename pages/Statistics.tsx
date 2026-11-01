import { useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMetrics, useNow } from "@/hooks/useApp";
import { useAppStore } from "@/store/appStore";
import { useT } from "@/lib/i18n";
import { dateLocale, fmtDate, fmtHours, fmtMoney } from "@/lib/format";
import { busiestWeekday, periodRange, series, totals, type DateRange, type Granularity, type PeriodKind } from "@/domain/stats";
import { parseLocalDate, toLocalDate } from "@/domain/time";
import { buildScheme, resolveDark } from "@/lib/theme";
import { EmptyState, FieldLabel, IconButton, Segmented, Surface } from "@/components/m3";
import { DatePickerField } from "@/components/Pickers";

function useChartColors() {
  // read the live scheme so charts follow light/dark and the seed color
  const theme = useAppStore((s) => s.settings.theme);
  const seed = useAppStore((s) => s.settings.seedColor);
  return useMemo(() => {
    const s = buildScheme(seed, resolveDark(theme));
    return {
      primary: s["primary"],
      tertiary: s["tertiary"],
      secondary: s["secondary-container"],
      grid: s["outline-variant"],
      text: s["on-surface-variant"],
      surface: s["surface-container-high"],
    };
  }, [theme, seed]);
}

export default function StatisticsPage() {
  const t = useT();
  const { shifts, settings, profile } = useAppStore();
  const lang = settings.language;
  const ws = settings.weekStartsOn;
  const now = useNow(60_000);
  const metrics = useMetrics(now);
  const today = toLocalDate(now);
  const [kind, setKind] = useState<PeriodKind>("month");
  const [offset, setOffset] = useState(0);
  const [customFrom, setCustomFrom] = useState(periodRange("month", today, 0, ws).from);
  const [customTo, setCustomTo] = useState(today);
  const [gran, setGran] = useState<Granularity>("day");
  const colors = useChartColors();

  const range: DateRange =
    kind === "custom" ? (customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom }) : periodRange(kind, today, offset, ws);

  const data = useMemo(() => {
    const tot = totals(shifts, metrics, range);
    return {
      tot,
      points: series(shifts, metrics, range, gran, ws),
      busiest: busiestWeekday(shifts, metrics, range),
    };
  }, [shifts, metrics, range.from, range.to, gran, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (key: string) => {
    const d = parseLocalDate(key);
    return gran === "month" ? format(d, "LLL", { locale: dateLocale(lang) }) : format(d, "d.MM", { locale: dateLocale(lang) });
  };
  const weekdayName = (wd: number) => format(new Date(2024, 0, 7 + wd), "EEEE", { locale: dateLocale(lang) });

  const kpis = [
    { label: t("totalHours"), value: fmtHours(data.tot.workedMs, lang), testId: "stats-total-hours" },
    { label: t("avgPerShift"), value: fmtHours(data.tot.count ? data.tot.workedMs / data.tot.count : 0, lang), testId: "stats-avg-hours" },
    { label: t("shifts"), value: String(data.tot.count), testId: "stats-count" },
    { label: t("overtime"), value: fmtHours(data.tot.overtimeMs, lang), testId: "stats-overtime" },
    { label: t("avgEarnings"), value: fmtMoney(data.tot.count ? data.tot.pay / data.tot.count : 0, profile.currency, lang), testId: "stats-avg-earnings" },
    { label: t("busiestDay"), value: data.busiest === null ? "—" : weekdayName(data.busiest), testId: "stats-busiest-day" },
  ];

  const tooltipStyle = { background: colors.surface, border: "none", borderRadius: 12, color: "inherit", fontSize: 13 };
  const axis = { stroke: colors.text, fontSize: 11, tickLine: false, axisLine: false } as const;
  const periodTitle = kind === "custom" ? null : `${fmtDate(range.from, lang, "d MMM yyyy")} – ${fmtDate(range.to, lang, "d MMM yyyy")}`;

  return (
    <div className="flex flex-col gap-5">
      <Segmented<PeriodKind>
        ariaLabel={t("custom")}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setOffset(0);
          setGran(k === "year" ? "month" : k === "quarter" ? "week" : "day");
        }}
        options={(["week", "month", "quarter", "year", "custom"] as const).map((k) => ({ value: k, label: t(k), testId: `stats-period-${k}` }))}
      />
      {kind === "custom" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>{t("from")}</FieldLabel>
            <DatePickerField value={customFrom} onChange={setCustomFrom} testId="stats-from" />
          </div>
          <div>
            <FieldLabel>{t("to")}</FieldLabel>
            <DatePickerField value={customTo} onChange={setCustomTo} testId="stats-to" />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <IconButton label={t("prev")} onClick={() => setOffset((o) => o - 1)} data-testid="stats-prev">
            <ChevronLeft />
          </IconButton>
          <p className="text-center text-sm font-semibold" data-testid="stats-period-title">
            {periodTitle}
          </p>
          <IconButton label={t("next")} onClick={() => setOffset((o) => o + 1)} data-testid="stats-next">
            <ChevronRight />
          </IconButton>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-3xl bg-primary p-5 text-on-primary">
          <p className="text-xs font-semibold opacity-85">{t("totalEarnings")}</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular" data-testid="stats-total-earnings">
            {fmtMoney(data.tot.pay, profile.currency, lang)}
          </p>
          {data.tot.overtimePay + data.tot.extraPay > 0 && (
            <p className="mt-1 text-xs opacity-85">
              {t("overtime")}: {fmtMoney(data.tot.overtimePay, profile.currency, lang)} · {t("extraPay")}: {fmtMoney(data.tot.extraPay, profile.currency, lang)}
            </p>
          )}
        </div>
        {kpis.map((k) => (
          <div key={k.testId} className="min-w-0 rounded-3xl bg-surface-container p-4">
            <p className="text-xs font-medium text-on-surface-variant">{k.label}</p>
            <p className="mt-1 truncate text-lg font-bold capitalize tabular" data-testid={k.testId}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {data.tot.count === 0 && data.tot.plannedMs === 0 ? (
        <EmptyState testId="stats-empty" icon={<BarChart3 />} title={t("noStats")} text={t("noStatsText")} />
      ) : (
        <>
          <Segmented<Granularity>
            ariaLabel={t("hoursChart")}
            value={gran}
            onChange={setGran}
            options={[
              { value: "day", label: t("byDay"), testId: "stats-gran-day" },
              { value: "week", label: t("byWeek"), testId: "stats-gran-week" },
              { value: "month", label: t("byMonth"), testId: "stats-gran-month" },
            ]}
          />
          <Surface className="p-4 sm:p-5" data-testid="chart-hours">
            <h3 className="mb-3 font-bold">{t("hoursChart")}</h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.points} margin={{ left: -18, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="key" tickFormatter={label} {...axis} minTickGap={8} />
                  <YAxis {...axis} width={44} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: colors.grid, opacity: 0.3 }} labelFormatter={(l: string) => label(l)} formatter={(v: number) => [`${v} ${t("hoursShort")}`, t("actual")]} />
                  <Bar dataKey="hours" fill={colors.primary} radius={[8, 8, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Surface>
          <Surface className="p-4 sm:p-5" data-testid="chart-earnings">
            <h3 className="mb-3 font-bold">{t("earningsTrend")}</h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.points} margin={{ left: -6, right: 4, top: 4 }}>
                  <defs>
                    <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.tertiary} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={colors.tertiary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="key" tickFormatter={label} {...axis} minTickGap={8} />
                  <YAxis {...axis} width={56} tickFormatter={(v: number) => fmtMoney(v, profile.currency, lang, true)} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(l: string) => label(l)} formatter={(v: number) => [fmtMoney(v, profile.currency, lang), t("earnings")]} />
                  <Area type="monotone" dataKey="earnings" stroke={colors.tertiary} strokeWidth={2.5} fill="url(#earnFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Surface>
          <Surface className="p-4 sm:p-5" data-testid="chart-planned-actual">
            <h3 className="mb-1 font-bold">{t("plannedVsActual")}</h3>
            <p className="mb-3 text-xs text-on-surface-variant">
              {t("planned")}: {fmtHours(data.tot.plannedMs, lang)} · {t("actual")}: {fmtHours(data.tot.workedMs, lang)}
            </p>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.points} margin={{ left: -18, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="key" tickFormatter={label} {...axis} minTickGap={8} />
                  <YAxis {...axis} width={44} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(l: string) => label(l)} formatter={(v: number, name: string) => [`${v} ${t("hoursShort")}`, name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="plannedHours" name={t("planned")} fill={colors.secondary} radius={[6, 6, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="hours" name={t("actual")} fill={colors.primary} radius={[6, 6, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}
