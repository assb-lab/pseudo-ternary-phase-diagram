import { useState } from "react";
import { KEYS, load, save } from "./storage";

export type Theme = "auto" | "light" | "dark";
export const THEMES: Theme[] = ["auto", "light", "dark"];

function stored(): Theme {
  const v = load(KEYS.theme);
  return v === "light" || v === "dark" ? v : "auto";
}

/** "auto" removes data-theme so the CSS follows prefers-color-scheme. */
export function applyTheme(theme: Theme): void {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(stored);
  const update = (t: Theme) => {
    setTheme(t);
    save(KEYS.theme, t === "auto" ? null : t);
    applyTheme(t);
  };
  return [theme, update];
}

/** Fills for the four-colored region map (only distinguishes neighbours; no meaning). */
export const REGION_FILLS = [
  "var(--region-1)",
  "var(--region-2)",
  "var(--region-3)",
  "var(--region-4)",
];
