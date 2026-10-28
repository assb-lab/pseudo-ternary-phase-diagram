import { describe, expect, it } from "vite-plus/test";
import sample from "../sample/Cl-Li-P-S_GGA_GGA+U_R2SCAN.json";
import { docsToEntries, IncompleteImportError, parseThermoJson, type ThermoDoc } from "../data/mp";
import { analyzePoint, endMemberEnergies } from "./reaction";
import { parseFormula } from "./formula";
import { buildHull, type Entry } from "./hull";
import {
  computeSection,
  decomposeAt,
  makeEndMember,
  molToW,
  relativeArea,
  wToMol,
} from "./pseudoTernary";

const entries = docsToEntries(sample.data as ThermoDoc[]);
const names = (hull: ReturnType<typeof buildHull>, idx: number[]) =>
  idx.map((i) => hull.phases[i].entry.name).sort();

describe("buildHull", () => {
  it("reproduces the MP stable set", () => {
    const hull = buildHull(entries, ["Li", "P", "S", "Cl"]);
    const mpStable = (sample.data as ThermoDoc[])
      .filter((d) => (d.energy_above_hull ?? 1) < 1e-9)
      .map((d) => d.formula_pretty)
      .sort();
    expect(names(hull, hull.stable)).toEqual(mpStable);
  });
});

describe("computeSection", () => {
  const ends = (...f: string[]) => f.map((s) => makeEndMember(s, parseFormula(s)));

  it("tiles the Li2S–P2S5–LiCl section with tie triangles", () => {
    const hull = buildHull(entries, ["Li", "P", "S", "Cl"]);
    const sec = computeSection(hull, ends("Li2S", "P2S5", "LiCl"));
    expect(sec.coverage).toBeGreaterThan(1 - 1e-6);
    const total = sec.regions.reduce(
      (s, r) => s + relativeArea(r.polygon.map((v) => wToMol(v, sec.endMembers))),
      0,
    );
    expect(total).toBeCloseTo(1, 6);
    const onPlane = sec.planePhases.filter((p) => hull.phases[p.phase].eHull < 1e-9);
    expect(
      names(
        hull,
        onPlane.map((p) => p.phase),
      ),
    ).toEqual(expect.arrayContaining(["Li2S", "Li3PS4", "LiCl", "P2S5"]));
    // 75Li2S·25P2S5 is Li3PS4.
    const li3ps4 = sec.planePhases.find((p) => hull.phases[p.phase].entry.name === "Li3PS4")!;
    const m = wToMol(li3ps4.w, sec.endMembers);
    expect(m[0]).toBeCloseTo(0.75, 9);
    expect(m[1]).toBeCloseTo(0.25, 9);
  });

  it("finds out-of-plane equilibria in a section that is not a tie plane", () => {
    const hull = buildHull(entries, ["Li", "P", "S"]);
    const sec = computeSection(hull, ends("Li", "P", "S"));
    expect(sec.coverage).toBeGreaterThan(1 - 1e-6);
    expect(sec.regions.every((r) => r.inPlane)).toBe(true);

    const hull4 = buildHull(entries, ["Li", "P", "S", "Cl"]);
    const sec4 = computeSection(hull4, ends("Li3P", "S", "LiCl"));
    expect(sec4.coverage).toBeGreaterThan(1 - 1e-6);
    // Every region's decomposition must match the LP at its centroid.
    for (const r of sec4.regions) {
      const c = [0, 1, 2].map(
        (i) => r.polygon.reduce((s, v) => s + v[i], 0) / r.polygon.length,
      ) as [number, number, number];
      const { parts } = decomposeAt(hull4, sec4, c);
      expect(parts.map((p) => p.phase).sort((a, b) => a - b)).toEqual(r.phases);
    }
  });

  it("round-trips mol and atom coordinates", () => {
    const e = ends("Li2S", "P2S5", "LiCl");
    const m: [number, number, number] = [0.5, 0.2, 0.3];
    const back = wToMol(molToW(m, e), e);
    back.forEach((v, i) => expect(v).toBeCloseTo(m[i], 12));
  });

  it("rejects collinear end members", () => {
    const fake: Entry[] = [
      { id: "a", name: "Li", composition: { Li: 1 }, energyPerAtom: 0 },
      { id: "b", name: "S", composition: { S: 1 }, energyPerAtom: 0 },
    ];
    const hull = buildHull(fake, ["Li", "S"]);
    expect(() => computeSection(hull, ends("Li", "S", "Li2S"))).toThrow();
  });
});

describe("review regressions", () => {
  it("counts product moles per displayed formula (Cl2, not Cl)", () => {
    const hull = buildHull(entries, ["Li", "P", "Cl"]);
    const sec = computeSection(
      hull,
      ["Cl2", "Li", "P"].map((s) => makeEndMember(s, parseFormula(s))),
    );
    const a = analyzePoint(hull, sec, endMemberEnergies(hull, sec), [1, 0, 0]);
    expect(a.products).toHaveLength(1);
    expect(hull.phases[a.products[0].phase].entry.name).toBe("Cl2");
    expect(a.products[0].moles).toBeCloseTo(1, 9);
  });

  it("rejects an import missing pages", () => {
    const page = JSON.stringify({ data: sample.data.slice(0, 50), meta: { total_doc: 1500 } });
    expect(() => parseThermoJson([page])).toThrow(IncompleteImportError);
    try {
      parseThermoJson([page]);
    } catch (e) {
      expect((e as IncompleteImportError).pages).toBe(2);
    }
    expect(parseThermoJson([JSON.stringify(sample)])).toHaveLength(sample.data.length);
  });
});

describe("stability threshold", () => {
  it("promotes metastable phases up to the threshold into the diagram", () => {
    const ends3 = ["Li2S", "P2S5", "LiCl"].map((s) => makeEndMember(s, parseFormula(s)));
    const base = buildHull(entries, ["Li", "P", "S", "Cl"]);
    const hull = buildHull(entries, ["Li", "P", "S", "Cl"], 0.02);
    const promotedNames = hull.stable
      .filter((i) => hull.phases[i].promoted)
      .map((i) => hull.phases[i].entry.name);
    expect(promotedNames).toEqual(expect.arrayContaining(["Li5P(S2Cl)2", "Li7P3S11"]));
    // Original E_hull is kept for display.
    const argyrodite = hull.phases.find((p) => p.entry.name === "Li5P(S2Cl)2")!;
    expect(argyrodite.eHull * 1000).toBeCloseTo(16, 0);
    const before = computeSection(base, ends3);
    const after = computeSection(hull, ends3);
    expect(after.regions.length).toBeGreaterThan(before.regions.length);
    expect(after.coverage).toBeGreaterThan(1 - 1e-6);
    const used = new Set(
      after.regions.flatMap((r) => r.phases.map((i) => hull.phases[i].entry.name)),
    );
    expect(used.has("Li5P(S2Cl)2")).toBe(true);
    // Below the threshold nothing changes.
    expect(buildHull(entries, ["Li", "P", "S", "Cl"], 0.001).stable).toEqual(base.stable);
  });
});
