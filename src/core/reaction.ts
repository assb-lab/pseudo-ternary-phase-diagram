import { fractionVector, type HullSystem } from "./hull";
import { decomposeAt, wToMol, type Bary, type Section } from "./pseudoTernary";

export interface Product {
  phase: number;
  /** Atomic fraction of the mixture carried by this phase. */
  atomFraction: number;
  /** Formula units (reduced formula) per one formula unit of mixture (Σ m_i = 1). */
  moles: number;
}

export interface PointAnalysis {
  w: Bary;
  mol: Bary;
  products: Product[];
  /** Index into `section.regions`, or -1 on a boundary. */
  region: number;
  /** Atoms per formula unit of the mixture x·A + y·B + z·C (x + y + z = 1). */
  atomsPerMixture: number;
  /** Equilibrium energy minus the end-member energies (eV/atom); null if an end member is missing. */
  reactionEnergy: number | null;
}

/** Lowest energy of any loaded entry with the end member's composition (eV/atom), or null. */
export function endMemberEnergies(hull: HullSystem, section: Section): (number | null)[] {
  return section.endMembers.map((e) => {
    const x = fractionVector(e.composition, hull.elements);
    let best: number | null = null;
    for (const p of hull.phases) {
      if (p.fraction.every((v, i) => Math.abs(v - x[i]) < 1e-9))
        if (best === null || p.formationPerAtom < best) best = p.formationPerAtom;
    }
    return best;
  });
}

export function analyzePoint(
  hull: HullSystem,
  section: Section,
  endEnergies: (number | null)[],
  w: Bary,
): PointAnalysis {
  const mol = wToMol(w, section.endMembers);
  const atomsPerMixture = mol.reduce((s, m, i) => s + m * section.endMembers[i].atoms, 0);
  const { energy, parts } = decomposeAt(hull, section, w);
  const products = parts
    .map((p) => ({
      ...p,
      moles: (p.atomFraction * atomsPerMixture) / hull.phases[p.phase].atomsPerFormula,
    }))
    .sort((a, b) => b.atomFraction - a.atomFraction);
  const key = parts
    .map((p) => p.phase)
    .sort((a, b) => a - b)
    .join(",");
  const region = section.regions.findIndex((r) => r.phases.join(",") === key);
  const reactionEnergy = endEnergies.every((e) => e !== null)
    ? energy - endEnergies.reduce<number>((s, e, i) => s + w[i] * e!, 0)
    : null;
  return { w, mol, products, region, atomsPerMixture, reactionEnergy };
}
