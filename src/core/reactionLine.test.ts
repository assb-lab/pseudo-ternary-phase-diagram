import { describe, expect, it } from "vite-plus/test";
import sample from "../sample/Cl-Li-P-S_GGA_GGA+U_R2SCAN.json";
import { docsToEntries, type ThermoDoc } from "../data/mp";
import { parseFormula } from "./formula";
import { buildHull } from "./hull";
import { computeSection, decomposeAt, makeEndMember, type Bary } from "./pseudoTernary";
import { describeEndpoint, energyAt, reactionLine, tToX, xToT } from "./reactionLine";

const entries = docsToEntries(sample.data as ThermoDoc[]);
const hull = buildHull(entries, ["Li", "P", "S", "Cl"]);
const section = (...f: string[]) =>
  computeSection(
    hull,
    f.map((s) => makeEndMember(s, parseFormula(s))),
  );
const name = (i: number) => hull.phases[i].entry.name;

describe("reactionLine", () => {
  it("Li2S → P2S5 forms Li3PS4 at x = 0.25 with the most negative energy", () => {
    const sec = section("Li2S", "P2S5", "LiCl");
    const s = describeEndpoint(hull, sec, [1, 0, 0]);
    const e = describeEndpoint(hull, sec, [0, 1, 0]);
    expect([s.label, e.label]).toEqual(["Li2S", "P2S5"]);
    const line = reactionLine(hull, sec, s, e);
    expect(line.kinks.map((k) => k.x)).toEqual([
      expect.closeTo(0, 9),
      expect.closeTo(0.25, 9),
      expect.closeTo(1, 9),
    ]);
    const mid = line.kinks[1];
    expect(mid.products.map((p) => name(p.phase))).toEqual(["Li3PS4"]);
    // 0.75 Li2S + 0.25 P2S5 → 0.5 Li3PS4
    expect(mid.products[0].moles).toBeCloseTo(0.5, 9);
    expect(line.minIndex).toBe(1);
    expect(mid.energy).toBeLessThan(0);
    expect(line.kinks[0].energy).toBeCloseTo(0, 9);
    expect(line.kinks[2].energy).toBeCloseTo(0, 9);
  });

  it("kinks are exactly where the equilibrium phase set changes", () => {
    const sec = section("Li3P", "S", "LiCl");
    const s = describeEndpoint(hull, sec, [1, 0, 0]);
    const e = describeEndpoint(hull, sec, [0, 1, 0]);
    const line = reactionLine(hull, sec, s, e);
    expect(line.kinks.length).toBeGreaterThan(3);
    const key = (w: Bary) =>
      decomposeAt(hull, sec, w)
        .parts.map((p) => p.phase)
        .sort((a, b) => a - b)
        .join(",");
    for (let i = 1; i < line.kinks.length; i++) {
      const [a, b] = [line.kinks[i - 1], line.kinks[i]];
      const at = (t: number): Bary => [1 - t, t, 0];
      // Constant phase set inside each segment, and energy linear in t there.
      const t1 = a.t + (b.t - a.t) * 0.3;
      const t2 = a.t + (b.t - a.t) * 0.7;
      expect(key(at(t1))).toBe(key(at(t2)));
      const exact = (t: number) =>
        decomposeAt(hull, sec, at(t)).energy - ((1 - t) * s.energy + t * e.energy);
      expect(energyAt(line, t1)).toBeCloseTo(exact(t1), 9);
    }
  });

  it("converts between atomic and mole fractions", () => {
    const sec = section("Li2S", "P2S5", "LiCl");
    const s = describeEndpoint(hull, sec, [1, 0, 0]);
    const e = describeEndpoint(hull, sec, [0, 1, 0]);
    expect(xToT(tToX(0.37, s, e), s, e)).toBeCloseTo(0.37, 12);
  });
});
