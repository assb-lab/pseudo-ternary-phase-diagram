import { numAtoms, parseFormula, reduceComposition, type Composition } from "./formula";
import { solveLp } from "./simplex";
import { I18nError } from "../i18n";

/** One computed phase: composition (any multiple) and energy per atom on a common scale. */
export interface Entry {
  id: string;
  name: string;
  composition: Composition;
  /** Energy per atom (eV/atom). Formation energies or corrected total energies, never mixed. */
  energyPerAtom: number;
  /** Energy above hull as reported by the data source (eV/atom), informational only. */
  eAboveHull?: number;
}

/** Entry with derived data used by the solvers. */
export interface PhaseEntry {
  entry: Entry;
  /** Atomic fractions over `elements` (same order). */
  fraction: number[];
  /** Formation energy per atom relative to the lowest elemental references (eV/atom). */
  formationPerAtom: number;
  /** Atoms per formula unit of `entry.name` (e.g. 2 for "Cl2"), else of the reduced composition. */
  atomsPerFormula: number;
  /** Energy above the hull of the loaded entries before any promotion (eV/atom). */
  eHull: number;
  /** Metastable entry moved just below the hull to be treated as stable (see buildHull). */
  promoted: boolean;
}

export interface HullSystem {
  /** Sorted element symbols. */
  elements: string[];
  /** All entries inside `elements`. */
  phases: PhaseEntry[];
  /** Indices into `phases` of the stable (on-hull) entries, one per composition. */
  stable: number[];
}

const STABLE_TOL = 1e-6;
/** Promoted entries sit this far below the original hull (eV/atom), so their decomposition is unique. */
export const PROMOTE_DEPTH = 1e-4;

/** Atomic-fraction vector of a composition over `elements`. */
export function fractionVector(comp: Composition, elements: string[]): number[] {
  const total = numAtoms(comp);
  return elements.map((el) => (comp[el] ?? 0) / total);
}

function sameFraction(a: number[], b: number[]): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
}

/** Atoms per displayed formula when the name is a formula of the same ratio (MP writes "Cl2", not "Cl"). */
function atomsPerFormula(entry: Entry, fraction: number[], elements: string[]): number {
  try {
    const shown = parseFormula(entry.name);
    if (Object.keys(shown).every((el) => elements.includes(el))) {
      if (sameFraction(fractionVector(shown, elements), fraction)) return numAtoms(shown);
    }
  } catch {
    // Not a formula: fall back to the reduced composition.
  }
  return numAtoms(reduceComposition(entry.composition).reduced);
}

export interface Decomposition {
  /** Indices into `HullSystem.phases`. */
  phase: number;
  /** Atomic fraction of the composition carried by this phase (sums to 1). */
  atomFraction: number;
}

/**
 * Lowest-energy combination of the given candidate phases at atomic-fraction vector `x`.
 * Returns the hull energy (eV/atom) and the phases with positive amounts.
 */
export function decompose(
  phases: PhaseEntry[],
  candidates: number[],
  x: number[],
): { energy: number; parts: Decomposition[] } {
  const m = x.length;
  const A = Array.from({ length: m }, (_, i) => candidates.map((j) => phases[j].fraction[i]));
  const c = candidates.map((j) => phases[j].formationPerAtom);
  const { x: amounts, value } = solveLp(A, x, c);
  const parts: Decomposition[] = [];
  amounts.forEach((a, k) => {
    if (a > 1e-9) parts.push({ phase: candidates[k], atomFraction: a });
  });
  return { energy: value, parts };
}

/** Lowest-energy entry of each distinct composition, and which of them are on the hull. */
function stableSet(phases: PhaseEntry[]): { best: number[]; stable: number[] } {
  const best: number[] = [];
  phases.forEach((p, i) => {
    const k = best.findIndex((j) => sameFraction(phases[j].fraction, p.fraction));
    if (k < 0) best.push(i);
    else if (p.formationPerAtom < phases[best[k]].formationPerAtom) best[k] = i;
  });
  // A composition is stable when no combination of the others lies below it.
  const stable = best.filter((i) => {
    const p = phases[i];
    if (p.formationPerAtom > STABLE_TOL) return false;
    const others = best.filter((j) => j !== i);
    try {
      const { energy } = decompose(phases, others, p.fraction);
      return p.formationPerAtom < energy + STABLE_TOL;
    } catch {
      return true; // the others cannot reach this composition (elemental endpoints)
    }
  });
  return { best, stable };
}

/**
 * Build the convex hull data (stable set, energies above hull) for the entries inside `elements`.
 *
 * `promote` (eV/atom): the lowest entry of each composition with 0 < E_hull ≤ promote is moved to
 * PROMOTE_DEPTH below the hull and so treated as stable. `eHull` keeps the original value.
 */
export function buildHull(entries: Entry[], elements: string[], promote = 0): HullSystem {
  const els = [...new Set(elements)].sort();
  const elSet = new Set(els);
  const inside = entries.filter((e) => Object.keys(e.composition).every((el) => elSet.has(el)));
  const refs: Record<string, number> = {};
  for (const e of inside) {
    const keys = Object.keys(e.composition);
    if (keys.length !== 1) continue;
    const el = keys[0];
    if (!(el in refs) || e.energyPerAtom < refs[el]) refs[el] = e.energyPerAtom;
  }
  const missing = els.filter((el) => !(el in refs));
  if (missing.length) throw new I18nError("hull.missingRefs", { elements: missing.join(", ") });

  const phases: PhaseEntry[] = inside.map((entry) => {
    const fraction = fractionVector(entry.composition, els);
    const refE = fraction.reduce((s, f, i) => s + f * refs[els[i]], 0);
    return {
      entry,
      fraction,
      formationPerAtom: entry.energyPerAtom - refE,
      atomsPerFormula: atomsPerFormula(entry, fraction, els),
      eHull: 0,
      promoted: false,
    };
  });

  const { best, stable } = stableSet(phases);
  for (const p of phases) {
    const { energy } = decompose(phases, stable, p.fraction);
    p.eHull = Math.max(0, p.formationPerAtom - energy);
  }
  if (promote <= 0) return { elements: els, phases, stable };

  const onHull = new Set(stable);
  let changed = false;
  for (const i of best) {
    const p = phases[i];
    if (onHull.has(i) || p.eHull > promote + 1e-12) continue;
    p.formationPerAtom -= p.eHull + PROMOTE_DEPTH;
    p.promoted = true;
    changed = true;
  }
  if (!changed) return { elements: els, phases, stable };
  return { elements: els, phases, stable: stableSet(phases).stable };
}
