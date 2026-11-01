import { useEffect, useRef, useState, type ReactNode } from "react";
import { Archive, Check, Download, FileJson, FileSpreadsheet, HardDriveDownload, Plus, RotateCcw, Smartphone, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { liveQuery } from "dexie";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/store/appStore";
import { SHIFT_TYPE_LABELS, useT } from "@/lib/i18n";
import { dateLocale } from "@/lib/format";
import { SEED_PRESETS } from "@/lib/theme";
import { promptInstall, usePwaStore } from "@/lib/pwa";
import { CURRENCIES, SHIFT_TYPES, type BackupRecord, type ProfileSettings, type ShiftType, type WorkProfile } from "@/domain/types";
import { shiftsToCsv } from "@/domain/backup";
import { computeAll } from "@/domain/earnings";
import { createProfile, deleteProfile, resetAllData, updateProfile, updateSettings } from "@/data/repo";
import { buildPayload, createLocalBackup, deleteLocalBackup, downloadFile, importPayload, restoreLocalBackup } from "@/data/backupRepo";
import { db } from "@/data/db";
import { runAction } from "@/hooks/useApp";
import { FieldLabel, IconButton, M3Button, Segmented, SelectField, Surface, Switch, TextField } from "@/components/m3";
import { ConfirmDialog } from "@/components/Pickers";
import { cn } from "@/lib/utils";

function Section({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <Surface data-testid={testId} className="flex flex-col gap-4">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      {children}
    </Surface>
  );
}

/** Numeric field with local text state; persists on blur / Enter (auto-save). */
function NumberField({ label, value, onCommit, testId, min = 0, step = "any" }: { label: string; value: number; onCommit: (v: number) => void; testId: string; min?: number; step?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n) && n >= min) {
      if (n !== value) onCommit(n);
    } else setText(String(value));
  };
  return (
    <div className="min-w-0">
      <FieldLabel htmlFor={testId}>{label}</FieldLabel>
      <TextField
        id={testId}
        inputMode="decimal"
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        data-testid={testId}
      />
    </div>
  );
}

function ProfileSection() {
  const t = useT();
  const { profile, profiles, settings } = useAppStore();
  const lang = settings.language;
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [name, setName] = useState(profile.name);
  useEffect(() => setName(profile.name), [profile.name]);
  const patch = (p: Partial<Omit<WorkProfile, "id">>) => void runAction(() => updateProfile(profile.id, p));
  const patchCfg = (p: Partial<ProfileSettings>) => patch({ settings: { ...profile.settings, ...p } });
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <>
      <Section title={t("profile")} testId="settings-profile">
        <div className="flex gap-2">
          <SelectField aria-label={t("profile")} value={profile.id} onChange={(e) => void updateSettings({ activeProfileId: e.target.value })} data-testid="settings-profile-select">
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
          <IconButton label={t("addProfile")} onClick={() => setNewOpen(true)} data-testid="settings-add-profile-btn">
            <Plus />
          </IconButton>
          {profiles.length > 1 && (
            <IconButton label={t("deleteProfile")} onClick={() => setDelOpen(true)} data-testid="settings-delete-profile-btn">
              <Trash2 />
            </IconButton>
          )}
        </div>
        <div>
          <FieldLabel htmlFor="profile-name">{t("profileName")}</FieldLabel>
          <TextField id="profile-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== profile.name && patch({ name: name.trim() })} data-testid="settings-profile-name" />
        </div>
      </Section>

      <Section title={t("payroll")} testId="settings-payroll">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumberField label={t("hourlyRate")} value={profile.hourlyRate} onCommit={(v) => patch({ hourlyRate: v })} testId="settings-hourly-rate" />
          <div>
            <FieldLabel htmlFor="settings-currency">{t("currency")}</FieldLabel>
            <SelectField
              id="settings-currency"
              value={profile.currency}
              data-testid="settings-currency-select"
              onChange={(e) => {
                const c = e.target.value;
                patch({ currency: c });
                void updateSettings({ currency: c });
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
          </div>
          <NumberField label={t("overtimeMultiplier")} value={profile.overtimeMultiplier} min={1} onCommit={(v) => patch({ overtimeMultiplier: v })} testId="settings-overtime-multiplier" />
          <NumberField label={t("overtimeThreshold")} value={profile.settings.overtimeThresholdHours} onCommit={(v) => patchCfg({ overtimeThresholdHours: v })} testId="settings-overtime-threshold" />
          <NumberField label={t("nightBonus")} value={profile.settings.nightBonusPercent} onCommit={(v) => patchCfg({ nightBonusPercent: v })} testId="settings-night-bonus" />
          <div>
            <FieldLabel>{t("nightHours")}</FieldLabel>
            <div className="flex items-center gap-2">
              <SelectField aria-label={t("start")} value={profile.settings.nightStartHour} onChange={(e) => patchCfg({ nightStartHour: Number(e.target.value) })} data-testid="settings-night-start">
                {hours.map((h) => (
                  <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
                ))}
              </SelectField>
              <span>–</span>
              <SelectField aria-label={t("end")} value={profile.settings.nightEndHour} onChange={(e) => patchCfg({ nightEndHour: Number(e.target.value) })} data-testid="settings-night-end">
                {hours.map((h) => (
                  <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
                ))}
              </SelectField>
            </div>
          </div>
          <NumberField label={t("weekendBonus")} value={profile.settings.weekendBonusPercent} onCommit={(v) => patchCfg({ weekendBonusPercent: v })} testId="settings-weekend-bonus" />
        </div>
        <Switch checked={profile.settings.paidBreaksByDefault} onChange={(v) => patchCfg({ paidBreaksByDefault: v })} label={t("paidBreaks")} testId="settings-paid-breaks" />
      </Section>

      <Section title={t("schedule")} testId="settings-schedule">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <FieldLabel htmlFor="def-start">{t("defaultStart")}</FieldLabel>
            <TextField id="def-start" type="time" value={profile.settings.defaultStartTime} onChange={(e) => e.target.value && patchCfg({ defaultStartTime: e.target.value })} data-testid="settings-default-start" />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor="def-end">{t("defaultEnd")}</FieldLabel>
            <TextField id="def-end" type="time" value={profile.settings.defaultEndTime} onChange={(e) => e.target.value && patchCfg({ defaultEndTime: e.target.value })} data-testid="settings-default-end" />
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <FieldLabel htmlFor="def-type">{t("defaultType")}</FieldLabel>
            <SelectField id="def-type" value={profile.settings.defaultShiftType} onChange={(e) => patchCfg({ defaultShiftType: e.target.value as ShiftType })} data-testid="settings-default-type">
              {SHIFT_TYPES.map((s) => (
                <option key={s} value={s}>
                  {SHIFT_TYPE_LABELS[lang][s]}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
      </Section>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent showCloseButton={false} className="rounded-[28px] bg-surface-container-high p-6 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t("addProfile")}</DialogTitle>
          </DialogHeader>
          <TextField autoFocus placeholder={t("profileName")} value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="new-profile-name" />
          <div className="flex justify-end gap-2">
            <M3Button variant="text" onClick={() => setNewOpen(false)}>
              {t("cancel")}
            </M3Button>
            <M3Button
              data-testid="new-profile-save"
              disabled={!newName.trim()}
              onClick={async () => {
                await runAction(() => createProfile(newName, profile));
                setNewName("");
                setNewOpen(false);
                toast.success(t("saved"));
              }}
            >
              {t("save")}
            </M3Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title={t("deleteProfile")}
        text={t("confirmDeleteProfile")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        testId="confirm-delete-profile"
        onConfirm={() => void runAction(() => deleteProfile(profile.id))}
      />
    </>
  );
}

function BackupSection() {
  const t = useT();
  const { settings, profile, shifts, breaks } = useAppStore();
  const lang = settings.language;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<unknown>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [totalShifts, setTotalShifts] = useState(0);

  useEffect(() => {
    const sub = liveQuery(async () => ({ list: await db.backups.orderBy("createdAt").reverse().toArray(), count: await db.shifts.count() })).subscribe({
      next: ({ list, count }) => {
        setBackups(list);
        setTotalShifts(count);
      },
    });
    return () => sub.unsubscribe();
  }, []);

  const stamp = () => format(new Date(), "yyyy-MM-dd_HHmm");
  const exportJson = async () => {
    const payload = await buildPayload();
    downloadFile(`shift-tracker_${stamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
  };
  const exportCsv = () => {
    const metrics = computeAll(shifts, breaks, profile, Date.now());
    downloadFile(`shifts_${stamp()}.csv`, shiftsToCsv(shifts, metrics, profile.currency), "text/csv;charset=utf-8");
  };
  const onFile = async (file: File) => {
    try {
      setPending(JSON.parse(await file.text()));
    } catch {
      toast.error(t("err_badJson"));
    }
  };
  const doImport = async (mode: "merge" | "replace") => {
    const raw = pending;
    setPending(null);
    const res = await runAction(() => importPayload(raw, mode));
    if (res) toast.success(t("importDone", { added: res.added, dup: res.duplicates, inv: res.invalid }));
  };

  return (
    <Section title={t("backup")} testId="settings-backup">
      <p className="text-sm text-on-surface-variant" data-testid="settings-shift-count">
        {t("shiftsStored", { n: totalShifts })}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <M3Button variant="tonal" onClick={() => void runAction(exportJson)} data-testid="export-json-btn">
          <FileJson /> {t("exportJson")}
        </M3Button>
        <M3Button variant="tonal" onClick={exportCsv} data-testid="export-csv-btn">
          <FileSpreadsheet /> {t("exportCsv")}
        </M3Button>
        <M3Button variant="outlined" onClick={() => fileRef.current?.click()} data-testid="import-json-btn">
          <Upload /> {t("importJson")}
        </M3Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="import-json-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <h3 className="text-sm font-bold">{t("localBackups")}</h3>
        <M3Button
          variant="text"
          data-testid="create-backup-btn"
          onClick={async () => {
            const r = await runAction(() => createLocalBackup(format(new Date(), "d MMM yyyy, HH:mm", { locale: dateLocale(lang) })));
            if (r) toast.success(t("backupCreated"));
          }}
        >
          <Archive /> {t("createBackup")}
        </M3Button>
      </div>
      {backups.length === 0 ? (
        <p className="text-sm text-on-surface-variant" data-testid="backups-empty">
          {t("noBackups")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="backups-list">
          {backups.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-2xl bg-surface-container p-2 pl-4" data-testid={`backup-item-${b.id}`}>
              <HardDriveDownload className="size-5 shrink-0 text-on-surface-variant" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{b.label}</p>
                <p className="text-xs text-on-surface-variant">{t("shiftsStored", { n: b.shiftCount })}</p>
              </div>
              <IconButton label={t("download")} onClick={() => downloadFile(`shift-tracker_backup_${b.createdAt}.json`, JSON.stringify(b.data, null, 2), "application/json")} data-testid={`backup-download-${b.id}`}>
                <Download />
              </IconButton>
              <IconButton label={t("restore")} onClick={() => setRestoreId(b.id)} data-testid={`backup-restore-${b.id}`}>
                <RotateCcw />
              </IconButton>
              <IconButton label={t("delete")} onClick={() => void runAction(() => deleteLocalBackup(b.id))} data-testid={`backup-delete-${b.id}`}>
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent showCloseButton={false} className="rounded-[28px] bg-surface-container-high p-6 sm:max-w-sm" data-testid="import-mode-dialog">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{t("importMode")}</DialogTitle>
          </DialogHeader>
          <button type="button" onClick={() => void doImport("merge")} data-testid="import-merge-btn" className="rounded-2xl bg-secondary-container p-4 text-left text-on-secondary-container hover:shadow-sm">
            <p className="font-bold">{t("importMerge")}</p>
            <p className="text-sm opacity-80">{t("importMergeText")}</p>
          </button>
          <button type="button" onClick={() => void doImport("replace")} data-testid="import-replace-btn" className="rounded-2xl border border-error/40 p-4 text-left hover:bg-error/5">
            <p className="font-bold text-error">{t("importReplace")}</p>
            <p className="text-sm text-on-surface-variant">{t("importReplaceText")}</p>
          </button>
          <M3Button variant="text" className="self-end" onClick={() => setPending(null)}>
            {t("cancel")}
          </M3Button>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={restoreId !== null}
        onOpenChange={(o) => !o && setRestoreId(null)}
        title={t("restore")}
        text={t("restoreConfirm")}
        confirmLabel={t("restore")}
        cancelLabel={t("cancel")}
        testId="confirm-restore"
        onConfirm={async () => {
          const id = restoreId;
          if (!id) return;
          const r = await runAction(() => restoreLocalBackup(id));
          if (r) toast.success(t("restored"));
        }}
      />
    </Section>
  );
}

export default function SettingsPage() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const installEvent = usePwaStore((s) => s.installEvent);
  const installed = usePwaStore((s) => s.installed);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetAck, setResetAck] = useState(false);
  const [customColor, setCustomColor] = useState(settings.seedColor);
  const set = (p: Parameters<typeof updateSettings>[0]) => void runAction(() => updateSettings(p));
  const notifDenied = "Notification" in window && Notification.permission === "denied";

  return (
    <div className="flex flex-col gap-4">
      <Section title={t("appearance")} testId="settings-appearance">
        <div>
          <FieldLabel>{t("language")}</FieldLabel>
          <Segmented
            ariaLabel={t("language")}
            value={settings.language}
            onChange={(v) => set({ language: v })}
            options={[
              { value: "ru", label: "Русский", testId: "settings-lang-ru" },
              { value: "en", label: "English", testId: "settings-lang-en" },
            ]}
          />
        </div>
        <div>
          <FieldLabel>{t("theme")}</FieldLabel>
          <Segmented
            ariaLabel={t("theme")}
            value={settings.theme}
            onChange={(v) => set({ theme: v })}
            options={[
              { value: "light", label: t("themeLight"), testId: "settings-theme-light" },
              { value: "dark", label: t("themeDark"), testId: "settings-theme-dark" },
              { value: "system", label: t("themeSystem"), testId: "settings-theme-system" },
            ]}
          />
        </div>
        <div>
          <FieldLabel>{t("dynamicColor")}</FieldLabel>
          <div className="flex flex-wrap items-center gap-3">
            {SEED_PRESETS.map((p) => {
              const active = settings.seedColor.toLowerCase() === p.color.toLowerCase();
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-label={p.id}
                  aria-pressed={active}
                  data-testid={`settings-seed-${p.id}`}
                  onClick={() => set({ seedColor: p.color })}
                  className={cn("flex size-12 items-center justify-center rounded-full ring-offset-2 ring-offset-surface-container-low transition-[box-shadow,transform] duration-200 ease-m3 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", active && "ring-2 ring-on-surface")}
                  style={{ background: p.color }}
                >
                  {active && <Check className="size-5 text-white" />}
                </button>
              );
            })}
            <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-outline px-3 text-sm">
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                onBlur={() => customColor !== settings.seedColor && set({ seedColor: customColor })}
                className="size-7 cursor-pointer rounded-full border-none bg-transparent p-0"
                data-testid="settings-seed-custom"
              />
              {t("customColor")}
            </label>
          </div>
        </div>
      </Section>

      <ProfileSection />

      <Section title={t("formats")} testId="settings-formats">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>{t("timeFormat")}</FieldLabel>
            <Segmented
              ariaLabel={t("timeFormat")}
              value={settings.timeFormat}
              onChange={(v) => set({ timeFormat: v })}
              options={[
                { value: "24h", label: "24 ч / 24h", testId: "settings-time-24h" },
                { value: "12h", label: "12 ч / AM-PM", testId: "settings-time-12h" },
              ]}
            />
          </div>
          <div>
            <FieldLabel>{t("weekStart")}</FieldLabel>
            <Segmented<"1" | "0">
              ariaLabel={t("weekStart")}
              value={String(settings.weekStartsOn) as "1" | "0"}
              onChange={(v) => set({ weekStartsOn: v === "1" ? 1 : 0 })}
              options={[
                { value: "1", label: t("monday"), testId: "settings-week-mon" },
                { value: "0", label: t("sunday"), testId: "settings-week-sun" },
              ]}
            />
          </div>
        </div>
        <Switch
          checked={settings.notificationsEnabled}
          testId="settings-notifications"
          label={notifDenied ? `${t("notifications")} — ${t("notificationsDenied")}` : t("notifications")}
          onChange={async (v) => {
            if (v && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
            set({ notificationsEnabled: v });
          }}
        />
      </Section>

      <BackupSection />

      <Section title={t("about")} testId="settings-about">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-tertiary-container text-on-tertiary-container">
            <Smartphone className="size-5" />
          </div>
          <p className="text-sm text-on-surface-variant">{t("installed")}</p>
        </div>
        {installEvent && !installed && (
          <M3Button variant="filled" className="self-start" onClick={() => void promptInstall()} data-testid="install-app-btn">
            <Download /> {t("install")}
          </M3Button>
        )}
      </Section>

      <Surface tone="outlined" className="flex flex-col gap-3 border-error/40" data-testid="settings-danger">
        <h2 className="text-base font-bold text-error">{t("dangerZone")}</h2>
        <M3Button
          variant="outlined"
          className="self-start border-error text-error hover:bg-error/8"
          onClick={() => {
            setResetAck(false);
            setResetOpen(true);
          }}
          data-testid="reset-data-btn"
        >
          <Trash2 /> {t("resetData")}
        </M3Button>
      </Surface>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t("resetConfirmTitle")}
        text={t("resetConfirmText")}
        confirmLabel={t("resetData")}
        cancelLabel={t("cancel")}
        confirmDisabled={!resetAck}
        testId="confirm-reset"
        onConfirm={async () => {
          const ok = await runAction(() => resetAllData().then(() => true));
          if (ok) toast.success(t("resetDone"));
        }}
      >
        <Switch checked={resetAck} onChange={setResetAck} label={t("resetConfirmCheck")} testId="confirm-reset-ack" />
      </ConfirmDialog>
    </div>
  );
}
