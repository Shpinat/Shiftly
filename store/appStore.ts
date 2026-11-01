import { create } from "zustand";
import type { Break, Settings, Shift, WorkProfile } from "@/domain/types";
import { DEFAULT_SETTINGS, makeDefaultProfile } from "@/domain/types";
import type { LocalDate } from "@/domain/types";

/** In-memory reactive mirror of IndexedDB (source of truth). Filled by liveQuery subscriptions in useBootstrap. */
interface AppState {
  ready: boolean;
  error: string | null;
  settings: Settings;
  profiles: WorkProfile[];
  profile: WorkProfile;
  shifts: Shift[];
  breaks: Break[];
}

export const useAppStore = create<AppState>(() => ({
  ready: false,
  error: null,
  settings: DEFAULT_SETTINGS,
  profiles: [],
  profile: makeDefaultProfile(),
  shifts: [],
  breaks: [],
}));

export type EditorMode = "create" | "edit" | "duplicate";

interface UiState {
  editor: { open: boolean; mode: EditorMode; shiftId: string | null; date: LocalDate | null; nonce: number };
  lastFinishedId: string | null;
  openCreate: (date?: LocalDate) => void;
  openEdit: (id: string) => void;
  openDuplicate: (id: string) => void;
  closeEditor: () => void;
  setLastFinished: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  editor: { open: false, mode: "create", shiftId: null, date: null, nonce: 0 },
  lastFinishedId: null,
  openCreate: (date) => set((s) => ({ editor: { open: true, mode: "create", shiftId: null, date: date ?? null, nonce: s.editor.nonce + 1 } })),
  openEdit: (id) => set((s) => ({ editor: { open: true, mode: "edit", shiftId: id, date: null, nonce: s.editor.nonce + 1 } })),
  openDuplicate: (id) => set((s) => ({ editor: { open: true, mode: "duplicate", shiftId: id, date: null, nonce: s.editor.nonce + 1 } })),
  closeEditor: () => set((s) => ({ editor: { ...s.editor, open: false } })),
  setLastFinished: (id) => set({ lastFinishedId: id }),
}));
