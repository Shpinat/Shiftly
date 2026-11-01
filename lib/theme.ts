/**
 * Material 3 tonal scheme generator ("Dynamic Color" from a seed).
 * Tones are mapped to OKLCH lightness using L ≈ (T + 16) / 116, a close match to CIELAB L*.
 */
import type { ThemeMode } from "@/domain/types";

export const SEED_PRESETS = [
  { id: "blue", color: "#1A5CE5" },
  { id: "emerald", color: "#006C4C" },
  { id: "amber", color: "#8A5100" },
  { id: "violet", color: "#6D4EA1" },
] as const;

interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function hexToOklch(hex: string): Oklch {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x1a5ce5;
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.sqrt(A * A + B * B), h: (h + 360) % 360 };
}

const tone = (t: number, c: number, h: number) => `oklch(${((t + 16) / 116).toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;

export type Scheme = Record<string, string>;

export function buildScheme(seed: string, dark: boolean): Scheme {
  const { c, h } = hexToOklch(seed);
  const pc = Math.min(Math.max(c, 0.06), 0.19);
  const sc = Math.min(pc / 3, 0.05);
  const tc = Math.min(pc * 0.6, 0.12);
  const th = (h + 60) % 360;
  const nc = 0.008;
  const nvc = 0.018;
  const fixed = (hue: number, chroma: number) =>
    dark
      ? { main: tone(80, chroma * 0.6, hue), on: tone(20, chroma * 0.6, hue), container: tone(30, chroma * 0.5, hue), onContainer: tone(90, 0.04, hue) }
      : { main: tone(40, chroma, hue), on: tone(100, 0, hue), container: tone(90, Math.min(chroma * 0.35, 0.06), hue), onContainer: tone(10, 0.06, hue) };
  const role = (name: string, hue: number, chroma: number): Scheme => {
    const f = fixed(hue, chroma);
    return { [name]: f.main, [`on-${name}`]: f.on, [`${name}-container`]: f.container, [`on-${name}-container`]: f.onContainer };
  };
  const neutral = dark
    ? { surface: 6, "surface-dim": 6, "surface-bright": 24, "surface-container-lowest": 4, "surface-container-low": 10, "surface-container": 12, "surface-container-high": 17, "surface-container-highest": 22, "on-surface": 90, "inverse-surface": 90, "inverse-on-surface": 20 }
    : { surface: 98, "surface-dim": 87, "surface-bright": 98, "surface-container-lowest": 100, "surface-container-low": 96, "surface-container": 94, "surface-container-high": 92, "surface-container-highest": 90, "on-surface": 10, "inverse-surface": 20, "inverse-on-surface": 95 };
  const variant = dark ? { "on-surface-variant": 80, outline: 60, "outline-variant": 30 } : { "on-surface-variant": 30, outline: 50, "outline-variant": 80 };
  const scheme: Scheme = {
    ...role("primary", h, pc),
    ...role("secondary", h, sc),
    ...role("tertiary", th, tc),
    ...(dark
      ? { error: "#FFB4AB", "on-error": "#690005", "error-container": "#93000A", "on-error-container": "#FFDAD6" }
      : { error: "#BA1A1A", "on-error": "#FFFFFF", "error-container": "#FFDAD6", "on-error-container": "#410002" }),
  };
  for (const [k, t] of Object.entries(neutral)) scheme[k] = tone(t, nc, h);
  for (const [k, t] of Object.entries(variant)) scheme[k] = tone(t, nvc, h);
  // shift-type palette, derived from the same tone rules so it follows light/dark
  const types: Record<string, [number, number]> = { standard: [h, pc], night: [th, tc], weekend: [70, 0.14], overtime: [27, 0.17], custom: [160, 0.12] };
  for (const [k, [hue, ch]] of Object.entries(types)) {
    const f = fixed(hue, ch);
    scheme[`type-${k}`] = f.main;
    scheme[`type-${k}-container`] = f.container;
  }
  scheme["success"] = dark ? tone(80, 0.11, 155) : tone(40, 0.12, 155);
  scheme["warning"] = dark ? tone(80, 0.11, 70) : tone(45, 0.13, 70);
  return scheme;
}

export function resolveDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

const SNAPSHOT_KEY = "st-theme";

export function applyTheme(mode: ThemeMode, seed: string): Scheme {
  const dark = resolveDark(mode);
  const scheme = buildScheme(seed, dark);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  for (const [k, v] of Object.entries(scheme)) root.style.setProperty(`--md-${k}`, v);
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#111318" : "#FAF8FF");
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ mode, seed }));
  } catch {
    /* storage unavailable: theme still applied */
  }
  return scheme;
}

/** First paint before IndexedDB answers: reuse the last applied theme. */
export function applyThemeSnapshot(): void {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    const snap = raw ? (JSON.parse(raw) as { mode: ThemeMode; seed: string }) : null;
    applyTheme(snap?.mode ?? "system", snap?.seed ?? SEED_PRESETS[0].color);
  } catch {
    applyTheme("system", SEED_PRESETS[0].color);
  }
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--md-${name}`).trim();
}
