import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { ru, enUS } from "react-day-picker/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/store/appStore";
import { fmtDate } from "@/lib/format";
import { parseLocalDate, toLocalDate } from "@/domain/time";
import type { LocalDate } from "@/domain/types";
import { cn } from "@/lib/utils";
import { M3Button, fieldClass } from "./m3";

/** M3 docked date picker: outlined field + calendar popover. */
export function DatePickerField({ value, onChange, testId, id, ariaLabel }: { value: LocalDate; onChange: (d: LocalDate) => void; testId: string; id?: string; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const lang = useAppStore((s) => s.settings.language);
  const weekStartsOn = useAppStore((s) => s.settings.weekStartsOn);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger id={id} aria-label={ariaLabel} data-testid={testId} className={cn(fieldClass, "flex items-center justify-between gap-2 text-left")}>
        <span className="truncate">{fmtDate(value, lang, "d MMMM yyyy, EEEEEE")}</span>
        <CalendarDays className="size-5 shrink-0 text-on-surface-variant" />
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-3xl bg-surface-container-high p-2" align="start">
        <Calendar
          mode="single"
          selected={parseLocalDate(value)}
          defaultMonth={parseLocalDate(value)}
          weekStartsOn={weekStartsOn}
          locale={lang === "ru" ? ru : enUS}
          onSelect={(d: Date | undefined) => {
            if (!d) return;
            onChange(toLocalDate(d.getTime()));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  confirmLabel,
  cancelLabel,
  onConfirm,
  danger = true,
  confirmDisabled,
  children,
  testId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  text?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
  testId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="rounded-[28px] bg-surface-container-high p-6 sm:max-w-sm" data-testid={testId}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          {text && <DialogDescription className="text-on-surface-variant">{text}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter className="mt-2 flex-row justify-end gap-2 border-none bg-transparent p-0">
          <M3Button variant="text" onClick={() => onOpenChange(false)} data-testid={`${testId}-cancel`}>
            {cancelLabel}
          </M3Button>
          <M3Button
            variant={danger ? "danger" : "filled"}
            disabled={confirmDisabled}
            data-testid={`${testId}-confirm`}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </M3Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
