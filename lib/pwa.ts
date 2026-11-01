import { create } from "zustand";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const usePwaStore = create<{ installEvent: BeforeInstallPromptEvent | null; installed: boolean }>(() => ({
  installEvent: null,
  installed: typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches,
}));

export function listenForInstall(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    usePwaStore.setState({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => usePwaStore.setState({ installEvent: null, installed: true }));
}

export async function promptInstall(): Promise<void> {
  const ev = usePwaStore.getState().installEvent;
  if (!ev) return;
  await ev.prompt();
  await ev.userChoice;
  usePwaStore.setState({ installEvent: null });
}
