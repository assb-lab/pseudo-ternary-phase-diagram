import { useSyncExternalStore } from "react";
import { en } from "./en";
import { ja, type MessageKey } from "./ja";
import { KEYS, load, save } from "../storage";

export type Lang = "ja" | "en";
export const LANGS: Lang[] = ["ja", "en"];
export type { MessageKey };

/** Param values may be thunks so that nested messages are translated when rendered, not when built. */
export type Params = Record<string, string | number | (() => string)>;

const dicts: Record<Lang, Record<MessageKey, string>> = { ja, en };

function initialLang(): Lang {
  const saved = load(KEYS.lang);
  if (saved === "ja" || saved === "en") return saved;
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ja"))
    return "ja";
  return "en";
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  save(KEYS.lang, lang);
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

/** Message in the current language with `{name}` placeholders filled. */
export function t(key: MessageKey, params: Params = {}): string {
  return dicts[current][key].replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    if (v === undefined) return m;
    return typeof v === "function" ? v() : String(v);
  });
}

/** Re-render on language change; returns the current language. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getLang,
    getLang,
  );
}

/** Error whose message follows the current language each time it is read. */
export class I18nError extends Error {
  readonly key: MessageKey;
  readonly params: Params;
  constructor(key: MessageKey, params: Params = {}) {
    super();
    this.key = key;
    this.params = params;
    Object.defineProperty(this, "message", { get: () => t(key, params) });
  }
}
