import { forwardRef, useMemo, type PointerEvent } from "react";
import { colorRegions } from "../core/coloring";
import type { HullSystem } from "../core/hull";
import { molToW, relativeArea, wToMol, type Bary, type Section } from "../core/pseudoTernary";
import { t, useLang } from "../i18n";
import { REGION_FILLS } from "../theme";
import { SvgFormula } from "./Formula";

export type Basis = "mol" | "atom";

const SIDE = 560;
const TRI_H = (SIDE * Math.sqrt(3)) / 2;
const LEFT = 70;
const TOP = 56;
const VIEW_W = SIDE + 2 * LEFT;
const VIEW_H = TOP + TRI_H + 64;
const CORNERS: [number, number][] = [
  [LEFT + SIDE / 2, TOP], // end member 1 (top)
  [LEFT, TOP + TRI_H], // end member 2 (bottom left)
  [LEFT + SIDE, TOP + TRI_H], // end member 3 (bottom right)
];
const CENTER: [number, number] = [LEFT + SIDE / 2, TOP + (TRI_H * 2) / 3];

function baryToXY(b: Bary): [number, number] {
  return [
    b[0] * CORNERS[0][0] + b[1] * CORNERS[1][0] + b[2] * CORNERS[2][0],
    b[0] * CORNERS[0][1] + b[1] * CORNERS[1][1] + b[2] * CORNERS[2][1],
  ];
}

function xyToBary(x: number, y: number): Bary {
  const [tx, ty] = CORNERS[0];
  const [lx, ly] = CORNERS[1];
  const [rx, ry] = CORNERS[2];
  const det = (tx - lx) * (ry - ly) - (rx - lx) * (ty - ly);
  const b0 = ((x - lx) * (ry - ly) - (rx - lx) * (y - ly)) / det;
  const b2 = ((tx - lx) * (y - ly) - (x - lx) * (ty - ly)) / det;
  return [b0, 1 - b0 - b2, b2];
}

export interface DiagramProps {
  hull: HullSystem;
  section: Section;
  basis: Basis;
  /** Metastable entries up to this energy above hull (eV/atom) are drawn as hollow markers. */
  eHullMax: number;
  activeRegion: number | null;
  probe: Bary | null;
  onProbe: (w: Bary | null) => void;
  onPin: (w: Bary) => void;
  /** Reaction-line mode: clicks set the line ends and the pointer snaps to phases and corners. */
  lineMode: boolean;
  line: { start: Bary | null; end: Bary | null; kinks: Bary[] };
  onLinePoint: (w: Bary) => void;
}

const SNAP_PX = 12;

export const Diagram = forwardRef<SVGSVGElement, DiagramProps>(function Diagram(
  {
    hull,
    section,
    basis,
    eHullMax,
    activeRegion,
    probe,
    onProbe,
    onPin,
    lineMode,
    line,
    onLinePoint,
  },
  ref,
) {
  useLang();
  const ends = section.endMembers;
  const toBary = (w: Bary): Bary => (basis === "mol" ? wToMol(w, ends) : w);
  const fromBary = (b: Bary): Bary => (basis === "mol" ? molToW(b, ends) : b);
  const toXY = (w: Bary) => baryToXY(toBary(w));

  const regions = useMemo(
    () =>
      section.regions.map((r) => {
        const pts = r.polygon.map((v) => baryToXY(basis === "mol" ? wToMol(v, ends) : v));
        const area = relativeArea(r.polygon.map((v) => (basis === "mol" ? wToMol(v, ends) : v)));
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        return { region: r, d: `M${pts.map((p) => p.join(",")).join("L")}Z`, area, cx, cy };
      }),
    [section, basis, ends],
  );

  // Adjacency is a topological property, so it is the same in the atom and mol bases.
  const colors = useMemo(() => colorRegions(section.regions.map((r) => r.polygon)), [section]);

  const markers = useMemo(() => {
    const stable = new Set(hull.stable);
    const placed: { w: Bary }[] = [];
    const out: {
      phase: number;
      w: Bary;
      stable: boolean;
      promoted: boolean;
      atCorner: boolean;
    }[] = [];
    // Stable first so a metastable polymorph at the same spot is not drawn over it.
    const sorted = [...section.planePhases].sort(
      (a, b) => hull.phases[a.phase].eHull - hull.phases[b.phase].eHull,
    );
    for (const p of sorted) {
      const isStable = stable.has(p.phase);
      if (!isStable && hull.phases[p.phase].eHull > eHullMax + 1e-12) continue;
      if (placed.some((q) => q.w.every((v, i) => Math.abs(v - p.w[i]) < 1e-9))) continue;
      placed.push(p);
      out.push({
        phase: p.phase,
        w: p.w,
        stable: isStable,
        promoted: isStable && hull.phases[p.phase].promoted,
        atCorner: p.w.some((v) => v > 1 - 1e-9),
      });
    }
    return out;
  }, [hull, section, eHullMax]);

  const handleMove = (e: PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const b = xyToBary(pt.x, pt.y);
    if (b.some((v) => v < -1e-9)) {
      onProbe(null);
      return;
    }
    const c = b.map((v) => Math.max(0, v));
    const s = c[0] + c[1] + c[2];
    let w = fromBary([c[0] / s, c[1] / s, c[2] / s]);
    if (lineMode) {
      // Snap to the nearest phase marker or corner so line ends hit exact compositions.
      let best = SNAP_PX;
      const corners: Bary[] = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      for (const cand of [...markers.map((m) => m.w), ...corners]) {
        const [x, y] = toXY(cand);
        const d = Math.hypot(x - pt.x, y - pt.y);
        if (d < best) {
          best = d;
          w = cand;
        }
      }
    }
    onProbe(w);
  };

  const grid: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let k = 1; k < 10; k++) {
    const t = k / 10;
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const l = (i + 2) % 3;
      const a: Bary = [0, 0, 0];
      const b: Bary = [0, 0, 0];
      a[i] = t;
      a[j] = 1 - t;
      b[i] = t;
      b[l] = 1 - t;
      const [x1, y1] = baryToXY(a);
      const [x2, y2] = baryToXY(b);
      grid.push({ x1, y1, x2, y2 });
    }
  }

  // Edge X→Y (counter-clockwise) carries the fraction of Y.
  const ticks: { x: number; y: number; label: string; anchor: "start" | "middle" | "end" }[] = [];
  for (let k = 1; k < 10; k++) {
    const t = k / 10;
    const left = baryToXY([1 - t, t, 0]);
    ticks.push({ x: left[0] - 8, y: left[1] + 4, label: `${k * 10}`, anchor: "end" });
    const bottom = baryToXY([0, 1 - t, t]);
    ticks.push({ x: bottom[0], y: bottom[1] + 18, label: `${k * 10}`, anchor: "middle" });
    const right = baryToXY([t, 0, 1 - t]);
    ticks.push({ x: right[0] + 8, y: right[1] + 4, label: `${k * 10}`, anchor: "start" });
  }

  const cornerLabelPos: { x: number; y: number; anchor: "start" | "middle" | "end" }[] = [
    { x: CORNERS[0][0], y: CORNERS[0][1] - 16, anchor: "middle" },
    { x: CORNERS[1][0] - 6, y: CORNERS[1][1] + 34, anchor: "middle" },
    { x: CORNERS[2][0] + 6, y: CORNERS[2][1] + 34, anchor: "middle" },
  ];

  const probeXY = probe ? toXY(probe) : null;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={t("diagram.ariaLabel", { system: ends.map((e) => e.label).join("–") })}
      onPointerMove={handleMove}
      onPointerLeave={() => onProbe(null)}
      onClick={() => probe && (lineMode ? onLinePoint(probe) : onPin(probe))}
      style={{ cursor: lineMode ? "crosshair" : undefined }}
      fontFamily="Inter, system-ui, sans-serif"
    >
      <defs>
        <pattern
          id="offplane-hatch"
          width={7}
          height={7}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={7} stroke="var(--hatch)" strokeWidth={1.4} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="var(--surface)" />

      {regions.map(({ d }, i) => (
        <path key={i} d={d} fill={REGION_FILLS[colors[i] % REGION_FILLS.length]} />
      ))}
      {regions.map(({ region, d }, i) =>
        region.inPlane ? null : <path key={i} d={d} fill="url(#offplane-hatch)" />,
      )}
      {grid.map((g, i) => (
        <line key={i} {...g} stroke="var(--grid)" strokeWidth={0.7} />
      ))}
      {regions.map(({ region, d }, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="var(--tie)"
          strokeWidth={region.inPlane ? 1.3 : 1}
          strokeDasharray={region.inPlane ? undefined : "4 3"}
          strokeLinejoin="round"
        />
      ))}
      {activeRegion !== null && regions[activeRegion] && (
        <path
          d={regions[activeRegion].d}
          fill="var(--accent-soft)"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      {regions.map(({ area, cx, cy }, i) =>
        area > 0.006 ? (
          <text
            key={i}
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="var(--ink)"
            stroke="var(--surface)"
            strokeWidth={3}
            paintOrder="stroke"
            pointerEvents="none"
          >
            {i + 1}
          </text>
        ) : null,
      )}

      <path
        d={`M${CORNERS.map((c) => c.join(",")).join("L")}Z`}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {ticks.map((t, i) => (
        <text key={i} x={t.x} y={t.y} textAnchor={t.anchor} fontSize={11} fill="var(--ink-3)">
          {t.label}
        </text>
      ))}
      <text x={VIEW_W - 12} y={VIEW_H - 10} textAnchor="end" fontSize={11} fill="var(--ink-3)">
        {basis === "mol" ? t("diagram.axisMol") : t("diagram.axisAtom")}
      </text>

      {markers.map((m) => {
        const [x, y] = toXY(m.w);
        const name = hull.phases[m.phase].entry.name;
        let dx = x - CENTER[0];
        let dy = y - CENTER[1];
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        return (
          <g key={m.phase} pointerEvents="none">
            <circle
              cx={x}
              cy={y}
              r={m.stable ? 4.5 : 4}
              fill={m.stable ? "var(--ink)" : "var(--surface)"}
              stroke={m.stable && !m.promoted ? "var(--surface)" : "var(--meta)"}
              strokeWidth={m.stable && !m.promoted ? 1.5 : 2}
            />
            {!m.atCorner && (
              <text
                x={x + dx * 12}
                y={y + dy * 12 + 4}
                textAnchor={dx > 0.35 ? "start" : dx < -0.35 ? "end" : "middle"}
                fontSize={m.stable ? 12 : 11}
                fontWeight={m.stable ? 600 : 400}
                fill={m.stable ? "var(--ink)" : "var(--ink-2)"}
                stroke="var(--surface)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                <SvgFormula f={name} />
              </text>
            )}
          </g>
        );
      })}

      {ends.map((e, i) => (
        <text
          key={i}
          x={cornerLabelPos[i].x}
          y={cornerLabelPos[i].y}
          textAnchor={cornerLabelPos[i].anchor}
          fontSize={16}
          fontWeight={650}
          fill="var(--ink)"
        >
          <SvgFormula f={e.label} />
        </text>
      ))}

      <ReactionLineOverlay
        line={line}
        preview={lineMode && line.start && !line.end ? probe : null}
        toXY={toXY}
      />

      {probeXY && (
        <g pointerEvents="none">
          <circle
            cx={probeXY[0]}
            cy={probeXY[1]}
            r={6}
            fill="none"
            stroke="var(--surface)"
            strokeWidth={4}
          />
          <circle
            cx={probeXY[0]}
            cy={probeXY[1]}
            r={6}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
          />
        </g>
      )}
    </svg>
  );
});

function ReactionLineOverlay({
  line,
  preview,
  toXY,
}: {
  line: DiagramProps["line"];
  preview: Bary | null;
  toXY: (w: Bary) => [number, number];
}) {
  if (!line.start) return null;
  const s = toXY(line.start);
  const target = line.end ?? preview;
  const e = target ? toXY(target) : null;
  // A straight line in the atom basis stays straight in the mol basis (projective map).
  const endLabel = (p: [number, number], label: string) => (
    <g>
      <circle
        cx={p[0]}
        cy={p[1]}
        r={6}
        fill="var(--accent)"
        stroke="var(--surface)"
        strokeWidth={2}
      />
      <text
        x={p[0]}
        y={p[1] - 11}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill="var(--accent)"
        stroke="var(--surface)"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {label}
      </text>
    </g>
  );
  return (
    <g pointerEvents="none">
      {e && (
        <>
          <line
            x1={s[0]}
            y1={s[1]}
            x2={e[0]}
            y2={e[1]}
            stroke="var(--surface)"
            strokeWidth={5}
            strokeLinecap="round"
          />
          <line
            x1={s[0]}
            y1={s[1]}
            x2={e[0]}
            y2={e[1]}
            stroke="var(--accent)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={line.end ? undefined : "6 4"}
          />
        </>
      )}
      {line.end &&
        line.kinks.slice(1, -1).map((k, i) => {
          const [x, y] = toXY(k);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={3.5}
              fill="var(--surface)"
              stroke="var(--accent)"
              strokeWidth={2}
            />
          );
        })}
      {endLabel(s, "S")}
      {line.end && e && endLabel(e, "E")}
    </g>
  );
}
