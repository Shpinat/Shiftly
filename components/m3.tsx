/** Material 3 building blocks on top of Tailwind tokens. One place for shapes, states and spacing. */
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ShiftType } from "@/domain/types";

type BtnVariant = "filled" | "tonal" | "outlined" | "text" | "elevated" | "danger";

const btnBase =
  "inline-flex min-h-12 select-none items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold tracking-wide transition-[background-color,box-shadow,transform,color] duration-200 ease-m3 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface [&_svg]:size-[18px] [&_svg]:shrink-0";

const btnVariants: Record<BtnVariant, string> = {
  filled: "bg-primary text-on-primary hover:shadow-md hover:bg-primary/92",
  tonal: "bg-secondary-container text-on-secondary-container hover:shadow-sm hover:bg-secondary-container/85",
  outlined: "border border-outline text-primary hover:bg-primary/8",
  text: "px-3 text-primary hover:bg-primary/8",
  elevated: "bg-surface-container-low text-primary shadow-sm hover:shadow-md",
  danger: "bg-error text-on-error hover:shadow-md",
};

export function M3Button({ variant = "filled", className, type = "button", ...props }: ComponentProps<"button"> & { variant?: BtnVariant }) {
  return <button type={type} className={cn(btnBase, btnVariants[variant], className)} {...props} />;
}

export function IconButton({ className, label, type = "button", ...props }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-12 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors duration-200 ease-m3 hover:bg-on-surface/8 active:bg-on-surface/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  );
}

export function Chip({ selected, className, type = "button", ...props }: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium transition-[background-color,border-color,color] duration-200 ease-m3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&_svg]:size-4",
        "relative after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']",
        selected
          ? "border-transparent bg-secondary-container text-on-secondary-container"
          : "border-outline-variant text-on-surface-variant hover:bg-on-surface/5",
        className,
      )}
      {...props}
    />
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  testId?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex w-full overflow-hidden rounded-full border border-outline", className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={o.testId}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 px-2 text-[13px] font-semibold transition-colors duration-200 ease-m3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              i > 0 && "border-l border-outline",
              active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface hover:bg-on-surface/5",
            )}
          >
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Surface({ className, tone = "low", ...props }: ComponentProps<"section"> & { tone?: "low" | "base" | "high" | "outlined" }) {
  const tones = {
    low: "bg-surface-container-low",
    base: "bg-surface-container",
    high: "bg-surface-container-high",
    outlined: "bg-surface border border-outline-variant",
  };
  return <section className={cn("rounded-3xl p-5", tones[tone], className)} {...props} />;
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-base font-bold tracking-tight text-on-surface">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, text, action, testId }: { icon: ReactNode; title: string; text?: string; action?: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="flex flex-col items-start gap-3 rounded-3xl border border-dashed border-outline-variant p-6">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-tertiary-container text-on-tertiary-container [&_svg]:size-6">{icon}</div>
      <div>
        <p className="font-bold text-on-surface">{title}</p>
        {text && <p className="mt-1 text-sm text-on-surface-variant">{text}</p>}
      </div>
      {action}
    </div>
  );
}

export const TYPE_DOT: Record<ShiftType, string> = {
  standard: "bg-type-standard",
  night: "bg-type-night",
  weekend: "bg-type-weekend",
  overtime: "bg-type-overtime",
  custom: "bg-type-custom",
};

export const TYPE_CONTAINER: Record<ShiftType, string> = {
  standard: "bg-type-standard-container",
  night: "bg-type-night-container",
  weekend: "bg-type-weekend-container",
  overtime: "bg-type-overtime-container",
  custom: "bg-type-custom-container",
};

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold tracking-wide text-on-surface-variant">
      {children}
    </label>
  );
}

export const fieldClass =
  "h-12 w-full min-w-0 rounded-xl border border-outline bg-transparent px-3.5 text-[15px] text-on-surface transition-[border-color,box-shadow] duration-200 ease-m3 placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50";

export function TextField({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function SelectField({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(fieldClass, "appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label, testId, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; testId?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex min-h-12 cursor-pointer items-center justify-between gap-4", disabled && "opacity-50")}>
      <span className="text-sm text-on-surface">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors duration-200 ease-m3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          checked ? "border-primary bg-primary" : "border-outline bg-surface-container-highest",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-full transition-[left,width,height,background-color] duration-200 ease-m3",
            checked ? "left-[22px] size-6 bg-on-primary" : "left-[6px] size-4 bg-outline",
          )}
        />
      </button>
    </label>
  );
}
