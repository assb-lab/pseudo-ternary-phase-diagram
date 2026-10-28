import { buildHull, decompose, type Entry } from "../core/hull";
import { normalizeMpId } from "../core/mpid";
import { I18nError, t } from "../i18n";

export const MP_API_BASE = "https://api.materialsproject.org";
/** Same-origin path proxied to MP_API_BASE by `vp dev` / `vp preview` (see vite.config.ts). */
export const MP_DEV_PROXY = "/mp-api";

export const THERMO_TYPES = ["GGA_GGA+U_R2SCAN", "GGA_GGA+U", "R2SCAN"] as const;
export type ThermoType = (typeof THERMO_TYPES)[number];

const FIELDS = [
  "material_id",
  "formula_pretty",
  "composition",
  "energy_per_atom",
  "formation_energy_per_atom",
  "energy_above_hull",
  "thermo_type",
  "deprecated",
];
export const PER_PAGE = 1000;

export interface ThermoDoc {
  material_id: string;
  formula_pretty: string;
  composition: Record<string, number>;
  energy_per_atom: number;
  formation_energy_per_atom?: number | null;
  energy_above_hull?: number | null;
  thermo_type: string;
  deprecated?: boolean;
}

/** All sub-systems of a chemical system, e.g. Li-S -> ["Li", "S", "Li-S"]. */
export function subChemsys(elements: string[]): string[] {
  const els = [...new Set(elements)].sort();
  const out: string[] = [];
  for (let mask = 1; mask < 1 << els.length; mask++) {
    out.push(els.filter((_, i) => mask & (1 << i)).join("-"));
  }
  return out;
}

function hasFormation(doc: ThermoDoc): boolean {
  return (
    typeof doc.formation_energy_per_atom === "number" &&
    Number.isFinite(doc.formation_energy_per_atom)
  );
}

/**
 * Convert non-deprecated thermo docs to entries on one energy scale.
 *
 * MP formation energies are used when every doc has one: in the GGA_GGA+U_R2SCAN mixing scheme the raw
 * `energy_per_atom` values are not on a common scale. Unstable entries are then placed at MP's
 * reported `energy_above_hull` over the hull of the stable entries (see alignToMpHull).
 */
export function docsToEntries(docs: ThermoDoc[]): Entry[] {
  const live = docs.filter((d) => !d.deprecated);
  const formation = live.length > 0 && live.every(hasFormation);
  const entries = live.map((d): Entry => ({
    id: normalizeMpId(String(d.material_id)),
    name: d.formula_pretty,
    composition: d.composition,
    energyPerAtom: formation ? d.formation_energy_per_atom! : d.energy_per_atom,
    eAboveHull: d.energy_above_hull ?? undefined,
  }));
  return formation ? alignToMpHull(entries) : entries;
}

/**
 * Place unstable entries at MP's reported distance above the hull of the stable entries.
 *
 * In the mixing scheme, `formation_energy_per_atom` of some GGA-only entries disagrees with their own
 * `energy_above_hull`. The stable entries (E_hull = 0) are mutually consistent, so
 * E_f = hull_stable(composition) + E_hull reproduces MP's phase diagram.
 */
export function alignToMpHull(entries: Entry[]): Entry[] {
  const stable = entries.filter((e) => e.eAboveHull !== undefined && e.eAboveHull <= 1e-9);
  const elements = [...new Set(entries.flatMap((e) => Object.keys(e.composition)))];
  let hull;
  try {
    hull = buildHull(stable, elements);
  } catch {
    return entries; // incomplete data (no stable elemental entry): keep MP formation energies
  }
  const all = hull.phases.map((_, i) => i);
  return entries.map((e) => {
    if (e.eAboveHull === undefined || e.eAboveHull <= 1e-9) return e;
    const total = Object.values(e.composition).reduce((a, b) => a + b, 0);
    const x = hull.elements.map((el) => (e.composition[el] ?? 0) / total);
    try {
      const { energy } = decompose(hull.phases, all, x);
      return { ...e, energyPerAtom: energy + e.eAboveHull };
    } catch {
      return e;
    }
  });
}

/** Thermo endpoint URL for one page of the chemical system and all its sub-systems. */
export function thermoUrl(
  elements: string[],
  thermoType: ThermoType,
  page = 1,
  base: string = MP_API_BASE,
): string {
  const params = new URLSearchParams({
    chemsys: subChemsys(elements).join(","),
    thermo_types: thermoType,
    _fields: FIELDS.join(","),
    _per_page: String(PER_PAGE),
    _page: String(page),
  });
  return `${base}/materials/thermo/?${params}`;
}

/** Terminal command downloading one page, with the key read from $MP_API_KEY (never shown). */
export function curlCommand(elements: string[], thermoType: ThermoType, page = 1): string {
  const file = `mp_${[...elements].sort().join("-")}_${thermoType}_p${page}.json`;
  return `curl -fsS -H "X-API-KEY: $MP_API_KEY" -o ${file} "${thermoUrl(elements, thermoType, page)}"`;
}

export interface FetchOptions {
  apiKey: string;
  baseUrl: string;
  elements: string[];
  thermoType: ThermoType;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | null) => void;
}

/** Fetch every thermo doc of the chemical system and its sub-systems. */
export async function fetchThermoDocs(opts: FetchOptions): Promise<ThermoDoc[]> {
  const key = opts.apiKey.trim();
  if (!key) throw new I18nError("mp.noKey");
  const docs: ThermoDoc[] = [];
  for (let page = 1; ; page++) {
    let res: Response;
    try {
      res = await fetch(thermoUrl(opts.elements, opts.thermoType, page, opts.baseUrl), {
        headers: { "X-API-KEY": key, Accept: "application/json" },
        signal: opts.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new I18nError("mp.network");
    }
    if (!res.ok) {
      const keyHint = res.status === 401 || res.status === 403;
      throw new I18nError("mp.http", {
        status: res.status,
        hint: () => (keyHint ? t("mp.httpKeyHint") : ""),
      });
    }
    const body = (await res.json()) as { data?: ThermoDoc[]; meta?: { total_doc?: number } };
    if (!Array.isArray(body.data)) throw new I18nError("mp.noData");
    docs.push(...body.data);
    const total = body.meta?.total_doc ?? null;
    opts.onProgress?.(docs.length, total);
    if (body.data.length < PER_PAGE || (total !== null && docs.length >= total)) break;
  }
  return docs.filter((d) => d.thermo_type === opts.thermoType);
}

/** Thrown when saved pages hold fewer docs than the API reported (`meta.total_doc`). */
export class IncompleteImportError extends I18nError {
  readonly pages: number;
  constructor(loaded: number, total: number) {
    const pages = Math.ceil(total / PER_PAGE);
    super("mp.incomplete", { loaded, total, pages });
    this.pages = pages;
  }
}

/** Read thermo docs from saved `/materials/thermo/` responses (one or more pages). */
export function parseThermoJson(texts: string[]): ThermoDoc[] {
  const docs: ThermoDoc[] = [];
  let total = 0;
  for (const text of texts) {
    const body = JSON.parse(text) as
      | { data?: ThermoDoc[]; meta?: { total_doc?: number } }
      | ThermoDoc[];
    const data = Array.isArray(body) ? body : body.data;
    if (!Array.isArray(data)) throw new I18nError("mp.noDataArray");
    if (!Array.isArray(body) && typeof body.meta?.total_doc === "number")
      total = Math.max(total, body.meta.total_doc);
    for (const d of data) {
      if (!d || typeof d.composition !== "object" || typeof d.material_id !== "string")
        throw new I18nError("mp.badDoc");
      docs.push(d);
    }
  }
  // Pages can overlap when re-downloaded: keep one doc per (id, thermo type).
  const seen = new Map<string, ThermoDoc>();
  for (const d of docs) seen.set(`${d.material_id}|${d.thermo_type}`, d);
  if (seen.size < total) throw new IncompleteImportError(seen.size, total);
  return [...seen.values()];
}
