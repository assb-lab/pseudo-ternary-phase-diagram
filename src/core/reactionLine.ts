import type { HullSystem } from "./hull";
import { decomposeAt, wToMol, type Bary, type Section } from "./pseudoTernary";
import type { Product } from "./reaction";

/**
 * Reactions along a straight line between two section points (start S, end E).
 *
 * Mixing is parameterised by the atomic fraction t of E (compositions are linear in t, so the hull
 * energy is piecewise linear in t with kinks where the line crosses a region boundary) and reported
 * as the mole fraction x of E formula units, as in "(1−x) S + x E → products".
 */

export interface Endpoint {
  w: Bary;
  /** Formula when the point is a loaded phase or an end member; null for an arbitrary mixture. */
  label: string | null;
  /** Atoms per formula unit (for a mixture: per formula unit of x·A + y·B + z·C, x + y + z = 1). */
  atoms: number;
  /** Energy of the starting material (eV/atom): the lowest entry of that composition, else the hull. */
  energy: number;
}

export interface Kink {
  /** Atomic fraction of E. */
  t: number;
  /** Mole fraction of E formula units. */
  x: number;
  w: Bary;
  /** Equilibrium products; `moles` are formula units per (1−x) S + x E. */
  products: Product[];
  /** Reaction energy relative to the unreacted S and E (eV/atom). */
  energy: number;
}

export interface ReactionLine {
  start: Endpoint;
  end: Endpoint;
  /** Composition points where the equilibrium phase set changes, including both ends. */
  kinks: Kink[];
  /** Index into `kinks` of the most negative reaction energy. */
  minIndex: number;
}

const SAME = 1e-9;

function sameW(a: Bary, b: Bary): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) < SAME);
}

/** Describe a section point as a starting material. */
export function describeEndpoint(hull: HullSystem, section: Section, w: Bary): Endpoint {
  // A phase on the section at this point: the lowest-energy entry names it.
  let phase = -1;
  for (const p of section.planePhases) {
    if (!sameW(p.w, w)) continue;
    if (phase < 0 || hull.phases[p.phase].formationPerAtom < hull.phases[phase].formationPerAtom)
      phase = p.phase;
  }
  if (phase >= 0) {
    const ph = hull.phases[phase];
    return { w, label: ph.entry.name, atoms: ph.atomsPerFormula, energy: ph.formationPerAtom };
  }
  const hullEnergy = decomposeAt(hull, section, w).energy;
  const corner = w.findIndex((v) => v > 1 - SAME);
  if (corner >= 0) {
    const e = section.endMembers[corner];
    return { w, label: e.label, atoms: e.atoms, energy: hullEnergy };
  }
  const mol = wToMol(w, section.endMembers);
  const atoms = mol.reduce((s, m, i) => s + m * section.endMembers[i].atoms, 0);
  return { w, label: null, atoms, energy: hullEnergy };
}

const lerp = (a: Bary, b: Bary, t: number): Bary => [
  a[0] + t * (b[0] - a[0]),
  a[1] + t * (b[1] - a[1]),
  a[2] + t * (b[2] - a[2]),
];

/** Mole fraction of E for atomic fraction t. */
export function tToX(t: number, start: Endpoint, end: Endpoint): number {
  const e = t / end.atoms;
  return e / (e + (1 - t) / start.atoms);
}

/** Atomic fraction of E for mole fraction x. */
export function xToT(x: number, start: Endpoint, end: Endpoint): number {
  const e = x * end.atoms;
  return e / (e + (1 - x) * start.atoms);
}

/** Region polygons are convex in w: the t-interval of the segment inside region r. */
function regionInterval(section: Section, r: number, a: Bary, b: Bary): [number, number] | null {
  const region = section.regions[r];
  // Rebuild the half-planes from the polygon edges (inside = same side as the centroid).
  const poly = region.polygon;
  const c = [0, 1, 2].map((k) => poly.reduce((s, v) => s + v[k], 0) / poly.length);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    // Line through p, q in the (w0, w1) plane: f(w) = (q−p) × (w−p).
    const f = (w: number[]) => (q[0] - p[0]) * (w[1] - p[1]) - (q[1] - p[1]) * (w[0] - p[0]);
    const sign = f(c) >= 0 ? 1 : -1;
    const fa = sign * f(a);
    const fb = sign * f(b);
    // fa + t (fb − fa) ≥ 0
    const d = fb - fa;
    if (Math.abs(d) < 1e-15) {
      if (fa < -1e-12) return null;
      continue;
    }
    const tc = -fa / d;
    if (d > 0) lo = Math.max(lo, tc);
    else hi = Math.min(hi, tc);
    if (lo > hi + 1e-12) return null;
  }
  return hi - lo > 1e-9 ? [lo, hi] : null;
}

export function reactionLine(
  hull: HullSystem,
  section: Section,
  start: Endpoint,
  end: Endpoint,
): ReactionLine {
  const ts = [0, 1];
  section.regions.forEach((_, r) => {
    const iv = regionInterval(section, r, start.w, end.w);
    if (iv) ts.push(iv[0], iv[1]);
  });
  ts.sort((a, b) => a - b);
  const uniq = ts.filter((t, i) => i === 0 || t - ts[i - 1] > 1e-7);

  const kinks: Kink[] = uniq.map((t) => {
    const w = lerp(start.w, end.w, t);
    const { energy, parts } = decomposeAt(hull, section, w);
    const x = tToX(t, start, end);
    const atomsTotal = (1 - x) * start.atoms + x * end.atoms;
    const products = parts
      .map((p) => ({
        ...p,
        moles: (p.atomFraction * atomsTotal) / hull.phases[p.phase].atomsPerFormula,
      }))
      .sort((a, b) => b.atomFraction - a.atomFraction);
    return {
      t,
      x,
      w,
      products,
      energy: energy - ((1 - t) * start.energy + t * end.energy),
    };
  });
  let minIndex = 0;
  kinks.forEach((k, i) => {
    if (k.energy < kinks[minIndex].energy) minIndex = i;
  });
  return { start, end, kinks, minIndex };
}

/** Reaction energy at atomic fraction t (exact: linear in t between kinks). */
export function energyAt(line: ReactionLine, t: number): number {
  const k = line.kinks;
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i].t + 1e-12) {
      const f = (t - k[i - 1].t) / (k[i].t - k[i - 1].t || 1);
      return k[i - 1].energy + f * (k[i].energy - k[i - 1].energy);
    }
  }
  return k[k.length - 1].energy;
}
