import { numAtoms, type Composition } from "./formula";
import { decompose, fractionVector, type Decomposition, type HullSystem } from "./hull";
import { matmul, matvec, pseudoInverse, transpose, type Matrix } from "./linalg";
import { I18nError } from "../i18n";

/**
 * Pseudo-ternary section A–B–C through the convex hull of the full chemical system.
 *
 * Two barycentric coordinate systems over the three end members are used:
 * - `w` (atom basis): fraction of atoms coming from each end member. Compositions are linear in w,
 *   so every phase region is a convex polygon in w.
 * - `m` (mol basis): mole fraction of end-member formula units, as in "x Li2S·y P2S5·z LiCl".
 *   m_i ∝ w_i / n_i (n_i = atoms per formula unit) is a projective map, which keeps straight lines
 *   straight, so polygons stay polygons when their vertices are mapped.
 */

export interface EndMember {
  label: string;
  composition: Composition;
  /** Atoms per formula unit as written. */
  atoms: number;
}

export type Bary = [number, number, number];

export interface Region {
  /** Indices into `HullSystem.phases` of the equilibrium phases. */
  phases: number[];
  /** Polygon vertices in the atom basis. */
  polygon: Bary[];
  /** True when every equilibrium phase lies on the section (a tie triangle / tie line). */
  inPlane: boolean;
}

export interface PlanePhase {
  /** Index into `HullSystem.phases`. */
  phase: number;
  /** Position in the atom basis. */
  w: Bary;
}

export interface Section {
  endMembers: EndMember[];
  /** Element fractions of the end members, columns of the N×3 matrix F. */
  F: Matrix;
  regions: Region[];
  /** Every loaded entry whose composition lies on the section (stable and metastable). */
  planePhases: PlanePhase[];
  /** Fraction of the triangle (mol basis area) covered by the found regions. */
  coverage: number;
}

const RESIDUAL_TOL = 1e-7;
const INSIDE_TOL = 1e-9;

export function wToMol(w: Bary, ends: EndMember[]): Bary {
  const v = w.map((x, i) => Math.max(0, x) / ends[i].atoms);
  const s = v[0] + v[1] + v[2];
  return [v[0] / s, v[1] / s, v[2] / s];
}

export function molToW(m: Bary, ends: EndMember[]): Bary {
  const v = m.map((x, i) => Math.max(0, x) * ends[i].atoms);
  const s = v[0] + v[1] + v[2];
  return [v[0] / s, v[1] / s, v[2] / s];
}

/** Atomic-fraction vector of the section point `w`. */
export function compositionAt(section: Pick<Section, "F">, w: Bary): number[] {
  return matvec(section.F, w);
}

/** Equilibrium decomposition at atom-basis point `w`. */
export function decomposeAt(
  hull: HullSystem,
  section: Pick<Section, "F">,
  w: Bary,
): { energy: number; parts: Decomposition[] } {
  return decompose(hull.phases, hull.stable, compositionAt(section, w));
}

/** Clip a convex polygon (atom basis) to the half-space h·w ≥ 0. */
function clip(poly: Bary[], h: number[]): Bary[] {
  const out: Bary[] = [];
  const d = poly.map((p) => h[0] * p[0] + h[1] * p[1] + h[2] * p[2]);
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const [a, b] = [poly[i], poly[j]];
    if (d[i] >= 0) out.push(a);
    if (d[i] >= 0 !== d[j] >= 0) {
      const t = d[i] / (d[i] - d[j]);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
    }
  }
  // Vertices on the clipping line are emitted twice; drop the repeats.
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length];
    return out.length < 2 || Math.max(...p.map((v, k) => Math.abs(v - q[k]))) > 1e-12;
  });
}

/** Area of a mol-basis polygon relative to the whole triangle. */
export function relativeArea(polyMol: Bary[]): number {
  // In barycentric coordinates the (m0, m1) projection has area ½ for the full triangle.
  let a = 0;
  for (let i = 0; i < polyMol.length; i++) {
    const p = polyMol[i];
    const q = polyMol[(i + 1) % polyMol.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a);
}

interface RegionSolver extends Region {
  /** λ(w) = H w gives the atomic fraction carried by each phase. */
  H: Matrix;
}

function regionFor(hull: HullSystem, F: Matrix, phases: number[]): RegionSolver | null {
  const P = transpose(phases.map((j) => hull.phases[j].fraction)); // N×k
  const G = pseudoInverse(P);
  if (!G) return null;
  const H = matmul(G, F); // k×3
  // The region is two-dimensional only if the whole section lies in the span of the phases.
  const back = matmul(P, H);
  for (let i = 0; i < F.length; i++)
    for (let j = 0; j < 3; j++) if (Math.abs(back[i][j] - F[i][j]) > RESIDUAL_TOL) return null;
  let polygon: Bary[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (const h of H) {
    polygon = clip(polygon, h);
    if (polygon.length < 3) return null;
  }
  return { phases, polygon, H, inPlane: false };
}

function insideRegion(r: RegionSolver, w: Bary): boolean {
  return r.H.every((h) => h[0] * w[0] + h[1] * w[1] + h[2] * w[2] >= -INSIDE_TOL);
}

/** Seed points (mol basis) at the centroids of an n-fold subdivision, nudged off rational ratios. */
function* seeds(n: number): Generator<Bary> {
  const e = 1e-4 * Math.SQRT2;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      const cands: [number, number][] = [[(i + 1 / 3) / n, (j + 1 / 3) / n]];
      if (j < n - i - 1) cands.push([(i + 2 / 3) / n, (j + 2 / 3) / n]);
      for (const [a0, b0] of cands) {
        const a = a0 + e / n;
        const b = b0 + (e * Math.PI) / (4 * n);
        const c = 1 - a - b;
        if (a > 0 && b > 0 && c > 0) yield [a, b, c];
      }
    }
  }
}

export function makeEndMember(label: string, composition: Composition): EndMember {
  return { label, composition, atoms: numAtoms(composition) };
}

/** Compute the phase regions of the A–B–C section. */
export function computeSection(hull: HullSystem, endMembers: EndMember[]): Section {
  if (endMembers.length !== 3) throw new I18nError("section.needThree");
  const F = transpose(endMembers.map((e) => fractionVector(e.composition, hull.elements)));
  const Fpinv = pseudoInverse(F);
  if (!Fpinv) throw new I18nError("section.collinear");

  // Entries lying on the section triangle.
  const planePhases: PlanePhase[] = [];
  hull.phases.forEach((p, phase) => {
    const w = matvec(Fpinv, p.fraction);
    const back = matvec(F, w);
    if (back.some((v, i) => Math.abs(v - p.fraction[i]) > RESIDUAL_TOL)) return;
    if (w.some((x) => x < -INSIDE_TOL)) return;
    const c = w.map((x) => Math.max(0, x));
    const s = c[0] + c[1] + c[2];
    planePhases.push({ phase, w: [c[0] / s, c[1] / s, c[2] / s] });
  });
  const onPlane = new Set(planePhases.map((p) => p.phase));

  const regions: RegionSolver[] = [];
  const tried = new Set<string>();
  let coverage = 0;
  for (const n of [24, 64, 160]) {
    for (const m of seeds(n)) {
      const w = molToW(m, endMembers);
      if (regions.some((r) => insideRegion(r, w))) continue;
      const { parts } = decomposeAt(hull, { F }, w);
      const phases = parts.map((p) => p.phase).sort((a, b) => a - b);
      const key = phases.join(",");
      if (tried.has(key)) continue;
      tried.add(key);
      const r = regionFor(hull, F, phases);
      if (!r) continue;
      if (relativeArea(r.polygon.map((v) => wToMol(v, endMembers))) < 1e-10) continue;
      r.inPlane = phases.every((j) => onPlane.has(j));
      regions.push(r);
    }
    coverage = regions.reduce(
      (s, r) => s + relativeArea(r.polygon.map((v) => wToMol(v, endMembers))),
      0,
    );
    if (coverage > 1 - 1e-6) break;
  }

  return {
    endMembers,
    F,
    regions: regions.map(({ phases, polygon, inPlane }) => ({ phases, polygon, inPlane })),
    planePhases,
    coverage,
  };
}
