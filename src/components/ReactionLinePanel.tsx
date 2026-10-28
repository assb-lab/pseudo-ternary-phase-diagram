import { useState, type PointerEvent } from "react";
import type { HullSystem } from "../core/hull";
import { wToMol, type Bary, type Section } from "../core/pseudoTernary";
import { energyAt, type ReactionLine } from "../core/reactionLine";
import { fmt, pct } from "../format";
import { t } from "../i18n";
import type { Basis } from "./Diagram";
import { Formula } from "./Formula";

export interface EndpointOption {
  key: string;
  label: string;
  w: Bary;
}

interface Props {
  hull: HullSystem;
  section: Section;
  basis: Basis;
  line: ReactionLine | null;
  start: Bary | null;
  end: Bary | null;
  options: EndpointOption[];
  onSetStart: (w: Bary) => void;
  onSetEnd: (w: Bary) => void;
  onSwap: () => void;
  onClear: () => void;
  onProbe: (w: Bary | null) => void;
}

const sameW = (a: Bary, b: Bary) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

export function ReactionLinePanel(props: Props) {
  const { section, basis, line, start, end, options } = props;
  const keyOf = (w: Bary | null) =>
    w ? (options.find((o) => sameW(o.w, w))?.key ?? "custom") : "";
  const select = (w: Bary | null, onSet: (w: Bary) => void, label: string) => (
    <label className="field">
      {label}
      <select
        value={keyOf(w)}
        onChange={(e) => {
          const o = options.find((o) => o.key === e.target.value);
          if (o) onSet(o.w);
        }}
      >
        <option value="" disabled>
          {t("line.choose")}
        </option>
        {w && keyOf(w) === "custom" && (
          <option value="custom">
            {t("line.mixture", { comp: molText(wToMol(w, section.endMembers)) })}
          </option>
        )}
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{t("line.title")}</h2>
        <div className="row">
          <button onClick={props.onSwap} disabled={!start || !end}>
            {t("line.swap")}
          </button>
          <button onClick={props.onClear} disabled={!start}>
            {t("line.clear")}
          </button>
        </div>
      </div>
      <div className="ends" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {select(start, props.onSetStart, t("line.start"))}
        {select(end, props.onSetEnd, t("line.end"))}
      </div>
      {!line && <p className="hint">{start ? t("line.hintEnd") : t("line.hintStart")}</p>}
      {line && (
        <>
          <EnergyChart line={line} basis={basis} onProbe={props.onProbe} />
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">{basis === "mol" ? t("line.xMol") : t("line.xAtom")}</th>
                  <th>{t("line.reaction")}</th>
                  <th className="num">ΔE (meV/atom)</th>
                </tr>
              </thead>
              <tbody>
                {line.kinks.map((k, i) => (
                  <tr
                    key={i}
                    className={i === line.minIndex ? "active" : undefined}
                    onMouseEnter={() => props.onProbe(k.w)}
                    onMouseLeave={() => props.onProbe(null)}
                  >
                    <td className="num">{fmt(basis === "mol" ? k.x : k.t)}</td>
                    <td>
                      <ReactionText line={line} k={k} hull={props.hull} />
                    </td>
                    <td className="num">
                      {fmt(k.energy * 1000, 1)}
                      {i === line.minIndex && line.kinks[i].energy < -1e-9 && (
                        <div className="hint">{t("line.min")}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            S = {endpointText(line.start, section)} · E = {endpointText(line.end, section)}
          </p>
          <p className="hint">{t("line.energyNote")}</p>
        </>
      )}
    </section>
  );
}

function molText(m: Bary): string {
  return m.map((v) => pct(v)).join(":");
}

function endpointText(e: ReactionLine["start"], section: Section): string {
  return e.label ?? t("line.mixture", { comp: molText(wToMol(e.w, section.endMembers)) });
}

function ReactionText({
  line,
  k,
  hull,
}: {
  line: ReactionLine;
  k: ReactionLine["kinks"][number];
  hull: HullSystem;
}) {
  const side = (coef: number, e: ReactionLine["start"], tag: string) =>
    coef > 1e-9 ? (
      <span>
        {Math.abs(coef - 1) > 1e-9 && `${fmt(coef)} `}
        {e.label ? <Formula f={e.label} /> : tag}
      </span>
    ) : null;
  const lhs = [side(1 - k.x, line.start, "S"), side(k.x, line.end, "E")].filter(Boolean);
  return (
    <span className="reaction-line">
      {lhs.map((el, i) => (
        <span key={i}>
          {i > 0 && " + "}
          {el}
        </span>
      ))}
      {" → "}
      {k.products.map((p, i) => (
        <span key={p.phase}>
          {i > 0 && " + "}
          {fmt(p.moles)} <Formula f={hull.phases[p.phase].entry.name} />
        </span>
      ))}
    </span>
  );
}

const CW = 640;
const CH = 210;
const PAD = { l: 52, r: 14, t: 24, b: 34 };

function niceStep(range: number): number {
  const raw = range / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
}

/** Reaction energy vs mixing ratio; exact (piecewise linear in the atomic fraction). */
function EnergyChart({
  line,
  basis,
  onProbe,
}: {
  line: ReactionLine;
  basis: Basis;
  onProbe: (w: Bary | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null); // atomic fraction
  const axis = (tt: number) =>
    basis === "mol"
      ? tt / line.end.atoms / (tt / line.end.atoms + (1 - tt) / line.start.atoms)
      : tt;
  const fromAxis = (a: number) =>
    basis === "mol" ? (a * line.end.atoms) / (a * line.end.atoms + (1 - a) * line.start.atoms) : a;

  const es = line.kinks.map((k) => k.energy * 1000);
  let lo = Math.min(0, ...es);
  let hi = Math.max(0, ...es);
  if (hi - lo < 1) hi = lo + 1;
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const X = (a: number) => PAD.l + a * (CW - PAD.l - PAD.r);
  const Y = (e: number) => PAD.t + ((hi - e) / (hi - lo)) * (CH - PAD.t - PAD.b);

  // Straight in t; curved in x, so sample each segment.
  const pts: string[] = [];
  for (let i = 1; i < line.kinks.length; i++) {
    const [a, b] = [line.kinks[i - 1].t, line.kinks[i].t];
    const n = basis === "mol" ? 24 : 1;
    for (let j = i === 1 ? 0 : 1; j <= n; j++) {
      const tt = a + ((b - a) * j) / n;
      pts.push(`${X(axis(tt))},${Y(energyAt(line, tt) * 1000)}`);
    }
  }
  const yTicks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) yTicks.push(v);

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const ctm = e.currentTarget.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const a = Math.min(1, Math.max(0, (p.x - PAD.l) / (CW - PAD.l - PAD.r)));
    const tt = fromAxis(a);
    setHover(tt);
    const s = line.start.w;
    const en = line.end.w;
    onProbe([0, 1, 2].map((i) => s[i] + tt * (en[i] - s[i])) as Bary);
  };

  const hoverE = hover === null ? null : energyAt(line, hover) * 1000;

  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      className="chart"
      role="img"
      aria-label={t("line.chartLabel")}
      onPointerMove={move}
      onPointerLeave={() => {
        setHover(null);
        onProbe(null);
      }}
    >
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={PAD.l}
            x2={CW - PAD.r}
            y1={Y(v)}
            y2={Y(v)}
            stroke={Math.abs(v) < 1e-9 ? "var(--ink-3)" : "var(--grid)"}
            strokeWidth={1}
          />
          <text x={PAD.l - 6} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">
            {fmt(v, Math.max(0, -Math.floor(Math.log10(step))))}
          </text>
        </g>
      ))}
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((a) => (
        <text
          key={a}
          x={X(a)}
          y={CH - PAD.b + 16}
          textAnchor="middle"
          fontSize={11}
          fill="var(--ink-3)"
        >
          {fmt(a, 1)}
        </text>
      ))}
      <text x={CW - PAD.r} y={CH - 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">
        {basis === "mol" ? t("line.xMol") : t("line.xAtom")}
      </text>
      <text x={4} y={4} fontSize={11} fill="var(--ink-3)" dominantBaseline="hanging">
        meV/atom
      </text>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {line.kinks.map((k, i) => (
        <circle
          key={i}
          cx={X(axis(k.t))}
          cy={Y(k.energy * 1000)}
          r={i === line.minIndex ? 5 : 4}
          fill={i === line.minIndex ? "var(--accent)" : "var(--surface)"}
          stroke="var(--accent)"
          strokeWidth={2}
        />
      ))}
      {hover !== null && hoverE !== null && (
        <g pointerEvents="none">
          <line
            x1={X(axis(hover))}
            x2={X(axis(hover))}
            y1={PAD.t}
            y2={CH - PAD.b}
            stroke="var(--ink-3)"
            strokeDasharray="3 3"
          />
          <text
            x={Math.min(X(axis(hover)) + 6, CW - PAD.r - 110)}
            y={PAD.t + 12}
            fontSize={11}
            fill="var(--ink)"
            stroke="var(--surface)"
            strokeWidth={3}
            paintOrder="stroke"
          >
            x = {fmt(axis(hover))}, ΔE = {fmt(hoverE, 1)}
          </text>
        </g>
      )}
      <rect
        x={PAD.l}
        y={PAD.t}
        width={CW - PAD.l - PAD.r}
        height={CH - PAD.t - PAD.b}
        fill="transparent"
      />
    </svg>
  );
}
