import type { Bary } from "./pseudoTernary";

const TOL = 1e-9;

type P2 = [number, number];
const proj = (b: Bary): P2 => [b[0], b[1]];

/** True when segments ab and cd lie on one line and overlap over a positive length. */
function sharesEdge(a: P2, b: P2, c: P2, d: P2): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < TOL * TOL) return false;
  const len = Math.sqrt(len2);
  const dist = (p: P2) => Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / len;
  if (dist(c) > TOL || dist(d) > TOL) return false;
  const t = (p: P2) => (dx * (p[0] - a[0]) + dy * (p[1] - a[1])) / len2;
  const [t1, t2] = [t(c), t(d)].sort((x, y) => x - y);
  return (Math.min(1, t2) - Math.max(0, t1)) * len > 1e-7;
}

/** Adjacency lists of convex polygons that share part of an edge (corner contact does not count). */
export function adjacency(polygons: Bary[][]): number[][] {
  const edges = polygons.map((poly) =>
    poly.map((v, i) => [proj(v), proj(poly[(i + 1) % poly.length])] as [P2, P2]),
  );
  const adj: number[][] = polygons.map(() => []);
  for (let i = 0; i < polygons.length; i++) {
    for (let j = i + 1; j < polygons.length; j++) {
      const touch = edges[i].some(([a, b]) => edges[j].some(([c, d]) => sharesEdge(a, b, c, d)));
      if (touch) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  return adj;
}

/**
 * Color indices 0..k-1 such that adjacent regions differ, using as few as `maxColors` (4 suffices for
 * a planar map). Backtracking in descending-degree order; deterministic for the same input.
 */
export function colorRegions(polygons: Bary[][], maxColors = 4): number[] {
  const adj = adjacency(polygons);
  const order = adj.map((_, i) => i).sort((a, b) => adj[b].length - adj[a].length || a - b);
  const color = new Array<number>(polygons.length).fill(-1);
  let steps = 0;
  const solve = (k: number): boolean => {
    if (k === order.length) return true;
    if (++steps > 200000) return false;
    const r = order[k];
    for (let c = 0; c < maxColors; c++) {
      if (adj[r].some((n) => color[n] === c)) continue;
      color[r] = c;
      if (solve(k + 1)) return true;
    }
    color[r] = -1;
    return false;
  };
  if (solve(0)) return color;
  // Unreachable for planar maps; fall back to greedy with as many colors as needed.
  color.fill(-1);
  for (const r of order) {
    let c = 0;
    while (adj[r].some((n) => color[n] === c)) c++;
    color[r] = c;
  }
  return color;
}
