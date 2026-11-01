import { useState } from "react";
import { ArrowRightLeft, Copy, Moon, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Shift } from "@/domain/types";
import type { ShiftMetrics } from "@/domain/earnings";
import { deleteShift, moveShift, restoreShift } from "@/data/repo";
import { runAction } from "@/hooks/useApp";
import { useAppStore, useUiStore } from "@/store/appStore";
import { SHIFT_TYPE_LABELS, STATUS_LABELS, useT } from "@/lib/i18n";
import { fmtDate, fmtDuration, fmtMoney, fmtTime } from "@/lib/format";
import { toLocalDate } from "@/domain/time";
import { cn } from "@/lib/utils";
import { ConfirmDialog, DatePickerField } from "./Pickers";
import { M3Button, TYPE_CONTAINER, TYPE_DOT } from "./m3";

const STATUS_STYLE: Record<Shift["status"], string> = {
  planned: "bg-secondary-container text-on-secondary-container",
  active: "bg-success/15 text-success",
  completed: "bg-surface-container-highest text-on-surface-variant",
  cancelled: "bg-error-container text-on-error-container",
};

export function StatusBadge({ status }: { status: Shift["status"] }) {
  const lang = useAppStore((s) => s.settings.language);
  return <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide", STATUS_STYLE[status])}>{STATUS_LABELS[lang][status]}</span>;
}

export function ShiftListItem({ shift, metrics, showDate = true, onNavigate }: { shift: Shift; metrics: ShiftMetrics | undefined; showDate?: boolean; onNavigate?: () => void }) {
  const t = useT();
  const { language: lang, timeFormat } = useAppStore((s) => s.settings);
  const currency = useAppStore((s) => s.profile.currency);
  const ui = useUiStore();
  // close any hosting sheet first so two modal sheets never stack
  const openEdit = (id: string) => {
    onNavigate?.();
    ui.openEdit(id);
  };
  const openDuplicate = (id: string) => {
    onNavigate?.();
    ui.openDuplicate(id);
  };
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDate, setMoveDate] = useState(shift.date);
  const end = shift.endTimestamp ?? shift.plannedEndTimestamp;
  const overnight = end !== null && toLocalDate(end) !== shift.date;
  const isActive = shift.status === "active";

  const onDelete = async () => {
    const res = await runAction(() => deleteShift(shift.id));
    if (res) toast(t("deleted"), { action: { label: t("undo"), onClick: () => void runAction(() => restoreShift(res.shift, res.breaks)) } });
  };

  return (
    <div data-testid={`shift-item-${shift.id}`} className="group relative flex items-stretch gap-3 overflow-hidden rounded-2xl bg-surface-container p-3 pl-4 transition-[background-color] duration-200 ease-m3 hover:bg-surface-container-high">
      <span className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", TYPE_DOT[shift.shiftType])} aria-hidden />
      <button
        type="button"
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
        onClick={() => openEdit(shift.id)}
        data-testid={`shift-item-open-${shift.id}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {showDate && <span className="text-sm font-bold capitalize text-on-surface">{fmtDate(shift.date, lang)}</span>}
          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-on-surface", TYPE_CONTAINER[shift.shiftType])}>
            {shift.shiftType === "night" && <Moon className="size-3" />}
            {SHIFT_TYPE_LABELS[lang][shift.shiftType]}
          </span>
          <StatusBadge status={shift.status} />
        </div>
        <div className="mt-1 font-mono text-sm tabular text-on-surface">
          {fmtTime(shift.startTimestamp, timeFormat)} – {end !== null ? fmtTime(end, timeFormat) : "…"}
          {overnight && <span className="ml-1 text-xs font-sans font-semibold text-tertiary">{t("nextDay")}</span>}
        </div>
        {metrics && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-on-surface-variant">
            <span>
              {t("worked")}: <b className="text-on-surface">{fmtDuration(metrics.workedMs, lang)}</b>
            </span>
            {metrics.breakMs > 0 && (
              <span>
                {t("breaks")}: {fmtDuration(metrics.breakMs, lang)}
              </span>
            )}
            {metrics.overtimeMs > 0 && <span className="text-tertiary">+{fmtDuration(metrics.overtimeMs, lang)}</span>}
          </div>
        )}
        {shift.notes && <p className="mt-1 line-clamp-1 text-xs italic text-on-surface-variant">{shift.notes}</p>}
      </button>
      <div className="flex shrink-0 flex-col items-end justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("edit")}
            data-testid={`shift-item-menu-${shift.id}`}
            className="inline-flex size-12 -mr-2 -mt-2 items-center justify-center rounded-full text-on-surface-variant hover:bg-on-surface/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MoreVertical className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44 rounded-2xl bg-surface-container-high p-1.5">
            <DropdownMenuItem className="min-h-11 gap-3 rounded-xl" onClick={() => openEdit(shift.id)} data-testid={`shift-edit-${shift.id}`}>
              <Pencil /> {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-3 rounded-xl" onClick={() => openDuplicate(shift.id)} data-testid={`shift-duplicate-${shift.id}`}>
              <Copy /> {t("duplicate")}
            </DropdownMenuItem>
            {!isActive && (
              <DropdownMenuItem
                className="min-h-11 gap-3 rounded-xl"
                data-testid={`shift-move-${shift.id}`}
                onClick={() => {
                  setMoveDate(shift.date);
                  setMoveOpen(true);
                }}
              >
                <ArrowRightLeft /> {t("move")}
              </DropdownMenuItem>
            )}
            {!isActive && (
              <DropdownMenuItem variant="destructive" className="min-h-11 gap-3 rounded-xl" onClick={() => setConfirmOpen(true)} data-testid={`shift-delete-${shift.id}`}>
                <Trash2 /> {t("delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {metrics && shift.status !== "cancelled" && (
          <span className="font-mono text-sm font-bold tabular text-primary" data-testid={`shift-item-earnings-${shift.id}`}>
            {fmtMoney(metrics.totalPay, currency, lang)}
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("confirmDeleteTitle")}
        text={t("confirmDeleteText")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={() => void onDelete()}
        testId="confirm-delete-shift"
      />
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent showCloseButton={false} className="rounded-[28px] bg-surface-container-high p-6 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t("moveTo")}</DialogTitle>
          </DialogHeader>
          <DatePickerField value={moveDate} onChange={setMoveDate} testId="move-date-field" />
          <DialogFooter className="flex-row justify-end gap-2 border-none bg-transparent p-0">
            <M3Button variant="text" onClick={() => setMoveOpen(false)}>
              {t("cancel")}
            </M3Button>
            <M3Button
              data-testid="move-confirm-btn"
              onClick={async () => {
                const ok = await runAction(() => moveShift(shift.id, moveDate).then(() => true));
                if (ok) {
                  toast.success(t("moved"));
                  setMoveOpen(false);
                }
              }}
            >
              {t("move")}
            </M3Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
