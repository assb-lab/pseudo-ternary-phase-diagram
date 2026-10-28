import { describe, expect, it } from "vite-plus/test";
import sample from "../sample/Cl-Li-P-S_GGA_GGA+U_R2SCAN.json";
import { docsToEntries, type ThermoDoc } from "../data/mp";
import { adjacency, colorRegions } from "./coloring";
import { parseFormula } from "./formula";
import { buildHull } from "./hull";
import { computeSection, makeEndMember, type Bary } from "./pseudoTernary";

const entries = docsToEntries(sample.data as ThermoDoc[]);

describe("colorRegions", () => {
  it("treats shared edges as adjacent but not corner contact", () => {
    // Four triangles of a square split by both diagonals meet at the center.
    const c: Bary = [1 / 3, 1 / 3, 1 / 3];
    const a: Bary = [1, 0, 0];
    const b: Bary = [0, 1, 0];
    const d: Bary = [0, 0, 1];
    const m: Bary = [0.5, 0.5, 0];
    const polys = [
      [a, m, c],
      [m, b, c],
      [b, d, c],
      [d, a, c],
    ];
    const adj = adjacency(polys);
    expect(adj[0].sort((x, y) => x - y)).toEqual([1, 3]);
    expect(adj[1].sort((x, y) => x - y)).toEqual([0, 2]);
  });

  it.each([
    ["Li", "P", "S"],
    ["Li3P", "S", "LiCl"],
    ["Li2S", "P2S5", "LiCl"],
  ])("4-colors the %s–%s–%s section without equal neighbours", (...f) => {
    const hull = buildHull(entries, ["Li", "P", "S", "Cl"]);
    const sec = computeSection(
      hull,
      f.map((s) => makeEndMember(s, parseFormula(s))),
    );
    const polys = sec.regions.map((r) => r.polygon);
    const colors = colorRegions(polys);
    expect(Math.max(...colors)).toBeLessThan(4);
    adjacency(polys).forEach((ns, i) => ns.forEach((n) => expect(colors[n]).not.toBe(colors[i])));
    // Real sections have neighbours, so the adjacency test is not vacuous.
    expect(adjacency(polys).some((ns) => ns.length > 0)).toBe(true);
  });
});
