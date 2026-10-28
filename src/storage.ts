// localStorage can be unavailable (private windows, blocked site data): never let it break the app.

export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string | null): void {
  try {
    if (value === null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export const KEYS = {
  apiKey: "ptpd.mpApiKey",
  ends: "ptpd.endMembers",
  thermoType: "ptpd.thermoType",
  lang: "ptpd.lang",
  theme: "ptpd.theme",
} as const;
