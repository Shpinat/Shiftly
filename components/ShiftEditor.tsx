import { useMemo, useState } from "react";
import { Moon, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAppStore, useUiStore } from "@/store/appStore";
import { BREAK_LABELS, REPEAT_LABELS, SHIFT_TYPE_LABELS, STATUS_LABELS, useT } from "@/lib/i18n";
import { fmtDuration, fmtMoney } from "@/lib/format";
import { BREAK_TYPES, SHIFT_TYPES, type BreakType, type LocalDate, type Shift, type ShiftStatus, type ShiftType } from "@/domain/types";
import { addLocalDays, resolveRange, toLocalDate } from "@/domain/time";
import { draftToEntities, shiftToDraft, type BreakDraft, type DraftError, type ShiftDraft } from "@/domain/shiftDraft";
import { computeShiftMetrics } from "@/domain/earnings";
import { REPEAT_PATTERNS, generateDates, type RepeatPattern } from "@/domain/recurrence";
import { deleteShift, saveShift } from "@/data/repo";
import { runAction } from "@/hooks/useApp";
import { cn } from "@/lib/utils";
import { Chip, FieldLabel, IconButton, M3Button, Segmented, SelectField, Switch, TextField, TYPE_DOT } from "./m3";
import { ConfirmDialog, DatePickerField } from "./Pickers";

const TEMPLATES: { key: "tplDay" | "tplNight" | "tpl24"; start: string; end: string; type: ShiftType }[] = [
  { key: "tplDay", start: "09:00", end: "18:00", type: "standard" },
  { key: "tplNight", start: "21:00", end: "09:00", type: "night" },
  { key: "tpl24", start: "08:00", end: "08:00", type: "standard" },
];

export function ShiftEditor() {
  const editor = useUiStore((s) => s.editor);
  const closeEditor = useUiStore((s) => s.closeEditor);
  return (
    <Sheet open={editor.open} onOpenChange={(o) => !o && closeEditor()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[94dvh] w-full max-w-2xl gap-0 overflow-y-auto overflow-x-hidden rounded-t-[28px] border-none bg-surface-container-low p-0"
        data-testid="shift-editor-sheet"
      >
        <div className="mx-auto mt-3 h-1 w-8 rounded-full bg-outline-variant" aria-hidden />
        {editor.open && <ShiftForm key={editor.nonce} />}
      </SheetContent>
    </Sheet>
  );
}

function ShiftForm() {
  const t = useT();
  const { editor, closeEditor } = useUiStore();
  const { shifts, breaks, profile, settings } = useAppStore();
  const lang = settings.language;
  const source: Shift | null = editor.shiftId ? (shifts.find((s) => s.id === editor.shiftId) ?? null) : null;
  const isEdit = editor.mode === "edit" && source !== null;
  const isActive = isEdit && source.status === "active";

  const [draft, setDraft] = useState<ShiftDraft>(() => {
    if (source) return shiftToDraft(source, breaks.filter((b) => b.shiftId === source.id), editor.mode === "duplicate");
    const date = editor.date ?? toLocalDate(Date.now());
    return {
      date,
      startTime: profile.settings.defaultStartTime,
      endTime: profile.settings.defaultEndTime,
      hourlyRate: null,
      shiftType: profile.settings.defaultShiftType,
      notes: "",
      status: null,
      breaks: [],
      repeat: "none",
      repeatUntil: addLocalDays(date, 30),
    };
  });
  const [rateText, setRateText] = useState(draft.hourlyRate === null ? "" : String(draft.hourlyRate));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof ShiftDraft>(k: K, v: ShiftDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setBreak = (i: number, patch: Partial<BreakDraft>) => setDraft((d) => ({ ...d, breaks: d.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));

  const range = resolveRange(draft.date, draft.startTime, draft.endTime);
  const preview = useMemo(() => {
    let n = 0;
    const res = draftToEntities(draft, draft.date, profile.id, Date.now(), isEdit ? source : null, () => `tmp-${n++}`);
    if ("error" in res) return { error: res.error } as const;
    const shift = isActive ? { ...res.shift, endTimestamp: Date.now() } : res.shift;
    return { metrics: computeShiftMetrics(shift, res.breaks, profile, Date.now()), status: res.shift.status } as const;
  }, [draft, profile, isEdit, isActive, source]);
  const occurrences = !isEdit && draft.repeat !== "none" ? generateDates(draft.date, draft.repeat, draft.repeatUntil).length : 1;

  const onSave = async () => {
    const count = await runAction(() => saveShift(draft, profile.id));
    if (count === undefined) return;
    toast.success(count > 1 ? t("savedMany", { n: count }) : t("saved"));
    closeEditor();
  };

  const title = isEdit ? t("editShift") : editor.mode === "duplicate" ? t("copyShift") : t("createShift");

  return (
    <form
      className="flex flex-col gap-5 px-5 pb-6 pt-2 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <SheetTitle className="text-[22px] font-bold tracking-tight text-on-surface">{title}</SheetTitle>
        <IconButton label={t("close")} onClick={closeEditor} data-testid="shift-form-close-btn">
          <X />
        </IconButton>
      </div>

      {!isActive && (
        <div>
          <FieldLabel>{t("templates")}</FieldLabel>
          <div className="-mx-1 flex flex-wrap gap-2 px-1">
            {TEMPLATES.map((tpl) => (
              <Chip
                key={tpl.key}
                data-testid={`shift-template-${tpl.key}`}
                selected={draft.startTime === tpl.start && draft.endTime === tpl.end}
                onClick={() => setDraft((d) => ({ ...d, startTime: tpl.start, endTime: tpl.end, shiftType: tpl.type }))}
              >
                {t(tpl.key)}
              </Chip>
            ))}
            <Chip
              data-testid="shift-template-default"
              onClick={() => setDraft((d) => ({ ...d, startTime: profile.settings.defaultStartTime, endTime: profile.settings.defaultEndTime, shiftType: profile.settings.defaultShiftType }))}
            >
              {t("tplDefault")}
            </Chip>
          </div>
        </div>
      )}

      <div>
        <FieldLabel>{t("date")}</FieldLabel>
        <DatePickerField value={draft.date} onChange={(d: LocalDate) => setDraft((x) => ({ ...x, date: d, repeatUntil: x.repeatUntil < d ? addLocalDays(d, 30) : x.repeatUntil }))} testId="shift-form-date" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <FieldLabel htmlFor="shift-start">{t("start")}</FieldLabel>
          <TextField id="shift-start" type="time" required value={draft.startTime} onChange={(e) => e.target.value && set("startTime", e.target.value)} data-testid="shift-form-start" />
        </div>
        <div className="min-w-0">
          <FieldLabel htmlFor="shift-end">
            {t("end")} {range.overnight && !isActive && <span className="ml-1 text-tertiary">{t("nextDay")}</span>}
          </FieldLabel>
          <TextField id="shift-end" type="time" required disabled={isActive} value={draft.endTime} onChange={(e) => e.target.value && set("endTime", e.target.value)} data-testid="shift-form-end" />
        </div>
      </div>
      {isActive && <p className="-mt-3 text-xs text-on-surface-variant">{t("activeEditHint")}</p>}

      <div>
        <FieldLabel>{t("shiftType")}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {SHIFT_TYPES.map((st) => (
            <Chip key={st} selected={draft.shiftType === st} onClick={() => set("shiftType", st)} data-testid={`shift-form-type-${st}`}>
              <span className={cn("size-2.5 rounded-full", TYPE_DOT[st])} />
              {st === "night" && <Moon />}
              {SHIFT_TYPE_LABELS[lang][st]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="shift-rate">{t("hourlyRate")}</FieldLabel>
          <TextField
            id="shift-rate"
            inputMode="decimal"
            placeholder={t("rateHint", { rate: fmtMoney(profile.hourlyRate, profile.currency, lang) })}
            value={rateText}
            data-testid="shift-form-rate"
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              setRateText(e.target.value);
              set("hourlyRate", v.trim() === "" ? null : Number(v));
            }}
          />
        </div>
        {isEdit && !isActive && (
          <div>
            <FieldLabel>{t("status")}</FieldLabel>
            <Segmented<ShiftStatus | "auto">
              ariaLabel={t("status")}
              value={draft.status ?? "auto"}
              onChange={(v) => set("status", v === "auto" ? null : v)}
              options={(["planned", "completed", "cancelled"] as const).map((s) => ({ value: s, label: STATUS_LABELS[lang][s], testId: `shift-form-status-${s}` }))}
            />
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <FieldLabel>{t("breaks")}</FieldLabel>
          {!isActive && (
            <M3Button
              variant="text"
              className="min-h-10"
              data-testid="shift-form-add-break"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  breaks: [...d.breaks, { startTime: "13:00", endTime: "13:30", type: "lunch", isPaid: profile.settings.paidBreaksByDefault }],
                }))
              }
            >
              <Plus /> {t("addBreak")}
            </M3Button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {draft.breaks.map((b, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-container p-3 sm:grid-cols-[1fr_1fr_1fr_auto]" data-testid={`shift-form-break-${i}`}>
              <SelectField aria-label={t("breaks")} value={b.type} disabled={isActive} onChange={(e) => setBreak(i, { type: e.target.value as BreakType })} data-testid={`shift-form-break-type-${i}`}>
                {BREAK_TYPES.map((bt) => (
                  <option key={bt} value={bt}>
                    {BREAK_LABELS[lang][bt]}
                  </option>
                ))}
              </SelectField>
              <div className="flex items-center justify-end sm:order-last">
                {!isActive && (
                  <IconButton label={t("delete")} onClick={() => setDraft((d) => ({ ...d, breaks: d.breaks.filter((_, j) => j !== i) }))} data-testid={`shift-form-break-remove-${i}`}>
                    <Trash2 />
                  </IconButton>
                )}
              </div>
              <TextField type="time" aria-label={t("start")} disabled={isActive} value={b.startTime} onChange={(e) => e.target.value && setBreak(i, { startTime: e.target.value })} data-testid={`shift-form-break-start-${i}`} />
              <TextField type="time" aria-label={t("end")} disabled={isActive} value={b.endTime} onChange={(e) => e.target.value && setBreak(i, { endTime: e.target.value })} data-testid={`shift-form-break-end-${i}`} />
              <div className="col-span-2 sm:col-span-4">
                <Switch checked={b.isPaid} disabled={isActive} onChange={(v) => setBreak(i, { isPaid: v })} label={b.isPaid ? t("paid") : t("unpaid")} testId={`shift-form-break-paid-${i}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {!isEdit && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="shift-repeat">{t("repeat")}</FieldLabel>
            <SelectField id="shift-repeat" value={draft.repeat} onChange={(e) => set("repeat", e.target.value as RepeatPattern)} data-testid="shift-form-repeat">
              {REPEAT_PATTERNS.map((p) => (
                <option key={p} value={p}>
                  {REPEAT_LABELS[lang][p]}
                </option>
              ))}
            </SelectField>
          </div>
          {draft.repeat !== "none" && (
            <div>
              <FieldLabel>
                {t("repeatUntil")} · {occurrences}
              </FieldLabel>
              <DatePickerField value={draft.repeatUntil} onChange={(d) => set("repeatUntil", d)} testId="shift-form-repeat-until" />
            </div>
          )}
        </div>
      )}

      <div>
        <FieldLabel htmlFor="shift-notes">{t("notes")}</FieldLabel>
        <textarea
          id="shift-notes"
          rows={2}
          placeholder={t("notesPlaceholder")}
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          data-testid="shift-form-notes"
          className="w-full rounded-xl border border-outline bg-transparent px-3.5 py-3 text-[15px] text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="rounded-2xl bg-primary-container p-4 text-on-primary-container" data-testid="shift-form-preview">
        {"error" in preview ? (
          <p className="text-sm font-semibold text-error" data-testid="shift-form-error">
            {t(`err_${preview.error as DraftError}`)}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs opacity-80">{t("duration")}</p>
              <p className="font-bold">{fmtDuration(preview.metrics.totalMs, lang)}</p>
            </div>
            <div>
              <p className="text-xs opacity-80">{t("worked")}</p>
              <p className="font-bold">{fmtDuration(preview.metrics.workedMs, lang)}</p>
            </div>
            <div>
              <p className="text-xs opacity-80">{t("earnings")}</p>
              <p className="font-bold" data-testid="shift-form-preview-earnings">
                {fmtMoney(preview.metrics.totalPay * occurrences, profile.currency, lang)}
              </p>
            </div>
            {!isEdit && (
              <p className="col-span-3 text-xs opacity-80">
                {t("status")}: {STATUS_LABELS[lang][preview.status]}
                {occurrences > 1 && ` · ×${occurrences}`}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {isEdit && !isActive ? (
          <M3Button variant="text" className="text-error hover:bg-error/8" onClick={() => setConfirmDelete(true)} data-testid="shift-form-delete-btn">
            <Trash2 /> {t("delete")}
          </M3Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <M3Button variant="text" onClick={closeEditor}>
            {t("cancel")}
          </M3Button>
          <M3Button type="submit" disabled={"error" in preview} data-testid="shift-form-save-btn">
            {t("save")}
          </M3Button>
        </div>
      </div>

      {isEdit && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("confirmDeleteTitle")}
          text={t("confirmDeleteText")}
          confirmLabel={t("delete")}
          cancelLabel={t("cancel")}
          testId="confirm-delete-form"
          onConfirm={async () => {
            const ok = await runAction(() => deleteShift(source.id));
            if (ok) {
              toast(t("deleted"));
              closeEditor();
            }
          }}
        />
      )}
    </form>
  );
}
