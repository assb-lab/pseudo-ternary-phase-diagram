import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { parseFormula, type Composition } from "./core/formula";
import { buildHull, type HullSystem } from "./core/hull";
import { mpUrl } from "./core/mpid";
import {
  computeSection,
  makeEndMember,
  molToW,
  wToMol,
  type Bary,
  type Section,
} from "./core/pseudoTernary";
import { analyzePoint, endMemberEnergies } from "./core/reaction";
import { describeEndpoint, reactionLine } from "./core/reactionLine";
import {
  curlCommand,
  docsToEntries,
  fetchThermoDocs,
  IncompleteImportError,
  MP_API_BASE,
  MP_DEV_PROXY,
  parseThermoJson,
  THERMO_TYPES,
  type ThermoDoc,
  type ThermoType,
} from "./data/mp";
import { Diagram, type Basis } from "./components/Diagram";
import { Formula } from "./components/Formula";
import { ReactionLinePanel, type EndpointOption } from "./components/ReactionLinePanel";
import { downloadSvg } from "./export";
import { fmt, pct } from "./format";
import { I18nError, LANGS, setLang, t, useLang, type Lang } from "./i18n";
import { KEYS, load, save } from "./storage";
import { REGION_FILLS, THEMES, useTheme, type Theme } from "./theme";

interface Dataset {
  docs: ThermoDoc[];
  /** Elements present in the docs. */
  elements: string[];
  /** Lazily translated label. */
  source: () => string;
}

interface Computed {
  hull: HullSystem;
  section: Section;
  endEnergies: (number | null)[];
}

/** The MP API sends CORS headers only to materialsproject.org; the local Vite server proxies it. */
const IS_LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

const DEFAULT_ENDS = ["Li2S", "P2S5", "LiCl"];

function loadEnds(): string[] {
  try {
    const v = JSON.parse(load(KEYS.ends) ?? "null") as unknown;
    if (Array.isArray(v) && v.length === 3 && v.every((s) => typeof s === "string")) return v;
  } catch {
    // fall through
  }
  return DEFAULT_ENDS;
}

function loadThermoType(): ThermoType {
  const v = load(KEYS.thermoType);
  return (THERMO_TYPES as readonly string[]).includes(v ?? "")
    ? (v as ThermoType)
    : THERMO_TYPES[0];
}

function datasetOf(docs: ThermoDoc[], source: () => string): Dataset {
  const elements = [...new Set(docs.flatMap((d) => Object.keys(d.composition)))].sort();
  return { docs, elements, source };
}

export default function App() {
  const lang = useLang();
  const [theme, setTheme] = useTheme();
  const [apiKey, setApiKey] = useState(() => load(KEYS.apiKey) ?? "");
  const [showKey, setShowKey] = useState(false);
  const [thermoType, setThermoType] = useState<ThermoType>(loadThermoType);
  const [endInputs, setEndInputs] = useState<string[]>(loadEnds);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [committed, setCommitted] = useState<{ ends: string[]; thermoType: ThermoType } | null>(
    null,
  );
  // Messages are thunks so they follow language changes.
  const [busy, setBusy] = useState<(() => string) | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [basis, setBasis] = useState<Basis>("mol");
  /** Display only: metastable phases up to this E_hull are drawn as hollow markers. */
  const [eHullMeV, setEHullMeV] = useState(25);
  /** Thermodynamics: metastable phases up to this E_hull are treated as stable. */
  const [stableMeV, setStableMeV] = useState(0);
  const [lineMode, setLineMode] = useState(false);
  const [lineStart, setLineStart] = useState<Bary | null>(null);
  const [lineEnd, setLineEnd] = useState<Bary | null>(null);
  const [hoverW, setHoverW] = useState<Bary | null>(null);
  const [pinnedW, setPinnedW] = useState<Bary | null>(null);
  const [hoverRegion, setHoverRegion] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Bumped by every data-source action; an async load only applies its result while still current. */
  const loadGen = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Pages the curl section lists; raised when an import turns out to be incomplete. */
  const [curlPages, setCurlPages] = useState(1);

  const updateApiKey = (v: string) => {
    setApiKey(v);
    save(KEYS.apiKey, v.trim() || null);
  };

  const updateEnd = (i: number, v: string) => {
    const next = endInputs.map((s, j) => (j === i ? v : s));
    setEndInputs(next);
    save(KEYS.ends, JSON.stringify(next));
  };

  useEffect(() => {
    document.title = t("app.title");
  }, [lang]);

  const computed = useMemo((): { result?: Computed; error?: Error } => {
    if (!dataset || !committed) return {};
    try {
      const docs = dataset.docs.filter((d) => d.thermo_type === committed.thermoType);
      if (!docs.length) throw new I18nError("err.noThermoType", { type: committed.thermoType });
      const comps = committed.ends.map((s) => parseFormula(s));
      const elements = [...new Set(comps.flatMap((c) => Object.keys(c)))];
      const hull = buildHull(docsToEntries(docs), elements, stableMeV / 1000);
      const section = computeSection(
        hull,
        committed.ends.map((s, i) => makeEndMember(s.trim(), comps[i])),
      );
      return { result: { hull, section, endEnergies: endMemberEnergies(hull, section) } };
    } catch (e) {
      return { error: e as Error };
    }
  }, [dataset, committed, stableMeV]);
  const result = computed.result;

  const probeW = hoverW ?? pinnedW;
  const analysis = useMemo(() => {
    if (!result || !probeW) return null;
    try {
      return analyzePoint(result.hull, result.section, result.endEnergies, probeW);
    } catch {
      return null;
    }
  }, [result, probeW]);
  const activeRegion = hoverRegion ?? (analysis && analysis.region >= 0 ? analysis.region : null);

  const parseEnds = (): Composition[] | null => {
    try {
      const comps = endInputs.map((s) => parseFormula(s));
      setError(null);
      return comps;
    } catch (e) {
      setError(e as Error);
      return null;
    }
  };

  const needed = (() => {
    try {
      return [...new Set(endInputs.flatMap((s) => Object.keys(parseFormula(s))))].sort();
    } catch {
      return null;
    }
  })();

  const commit = (ends: string[], tt: ThermoType) => {
    setCommitted({ ends: ends.map((s) => s.trim()), thermoType: tt });
    setPinnedW(null);
    setHoverW(null);
    setLineStart(null);
    setLineEnd(null);
  };

  const covers = (ds: Dataset | null, els: string[]) =>
    !!ds &&
    els.every((el) => ds.elements.includes(el)) &&
    ds.docs.some((d) => d.thermo_type === thermoType);

  /** Cancel any pending load and return the generation of the new one. */
  const startLoad = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(null);
    return ++loadGen.current;
  };

  const fetchAndCompute = async () => {
    const comps = parseEnds();
    if (!comps) return;
    const els = [...new Set(comps.flatMap((c) => Object.keys(c)))].sort();
    const gen = startLoad();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const ends = endInputs;
    const tt = thermoType;
    setBusy(() => () => t("busy.fetching"));
    try {
      const docs = await fetchThermoDocs({
        apiKey,
        baseUrl: IS_LOCAL ? MP_DEV_PROXY : MP_API_BASE,
        elements: els,
        thermoType,
        signal: ctrl.signal,
        onProgress: (n, total) => {
          if (gen === loadGen.current)
            setBusy(() => () => t("busy.progress", { n, total: total ? ` / ${total}` : "" }));
        },
      });
      if (gen !== loadGen.current) return;
      if (!docs.length) throw new I18nError("err.noEntries");
      setDataset(datasetOf(docs, () => `Materials Project (${els.join("-")}, ${tt})`));
      commit(ends, tt);
    } catch (e) {
      if (gen === loadGen.current && (e as Error).name !== "AbortError") setError(e as Error);
    } finally {
      if (gen === loadGen.current) {
        setBusy(null);
        abortRef.current = null;
      }
    }
  };

  const computeWithLoaded = () => {
    const comps = parseEnds();
    if (!comps) return;
    commit(endInputs, thermoType);
  };

  const loadFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    const gen = startLoad();
    try {
      const texts = await Promise.all(files.map((f) => f.text()));
      if (gen !== loadGen.current) return;
      const docs = parseThermoJson(texts);
      if (!docs.length) throw new I18nError("err.jsonEmpty");
      const names = files.map((f) => f.name).join(", ");
      const ds = datasetOf(docs, () => names);
      setDataset(ds);
      const types = [...new Set(docs.map((d) => d.thermo_type))];
      const tt = types.includes(thermoType)
        ? thermoType
        : ((types.find((t) => (THERMO_TYPES as readonly string[]).includes(t)) as ThermoType) ??
          thermoType);
      setThermoType(tt);
      save(KEYS.thermoType, tt);
      setError(null);
      if (needed && needed.every((el) => ds.elements.includes(el))) commit(endInputs, tt);
    } catch (err) {
      if (gen !== loadGen.current) return;
      if (err instanceof IncompleteImportError) setCurlPages(err.pages);
      setError(new I18nError("err.jsonFailed", { msg: () => (err as Error).message }));
    }
  };

  const loadSample = async () => {
    const gen = startLoad();
    const mod = await import("./sample/Cl-Li-P-S_GGA_GGA+U_R2SCAN.json");
    if (gen !== loadGen.current) return;
    const docs = (mod.default as { data: ThermoDoc[] }).data;
    setDataset(datasetOf(docs, () => t("data.sampleSource")));
    setThermoType("GGA_GGA+U_R2SCAN");
    save(KEYS.thermoType, "GGA_GGA+U_R2SCAN");
    const ends = needed?.every((el) => ["Cl", "Li", "P", "S"].includes(el))
      ? endInputs
      : DEFAULT_ENDS;
    setEndInputs(ends);
    save(KEYS.ends, JSON.stringify(ends));
    setError(null);
    commit(ends, "GGA_GGA+U_R2SCAN");
  };

  const exportSvg = () => {
    if (!svgRef.current || !committed) return;
    downloadSvg(svgRef.current, `pseudo-ternary_${committed.ends.join("-")}.svg`);
  };

  const line = useMemo(() => {
    if (!result || !lineStart || !lineEnd) return null;
    try {
      return reactionLine(
        result.hull,
        result.section,
        describeEndpoint(result.hull, result.section, lineStart),
        describeEndpoint(result.hull, result.section, lineEnd),
      );
    } catch {
      return null;
    }
  }, [result, lineStart, lineEnd]);

  /** Line ends offered in the selects: the end members, then the stable phases on the section. */
  const endpointOptions = useMemo((): EndpointOption[] => {
    if (!result) return [];
    const opts: EndpointOption[] = result.section.endMembers.map((e, i) => ({
      key: `c${i}`,
      label: e.label,
      w: [0, 1, 2].map((k) => (k === i ? 1 : 0)) as Bary,
    }));
    const stable = new Set(result.hull.stable);
    for (const p of result.section.planePhases) {
      if (!stable.has(p.phase)) continue;
      if (opts.some((o) => o.w.every((v, i) => Math.abs(v - p.w[i]) < 1e-9))) continue;
      opts.push({ key: `p${p.phase}`, label: result.hull.phases[p.phase].entry.name, w: p.w });
    }
    return opts;
  }, [result]);

  const addLinePoint = (w: Bary) => {
    if (!lineStart || lineEnd) {
      setLineStart(w);
      setLineEnd(null);
    } else if (w.some((v, i) => Math.abs(v - lineStart[i]) > 1e-9)) {
      setLineEnd(w);
    }
  };

  const canUseLoaded = needed !== null && covers(dataset, needed);
  const shownError = (error ?? computed.error)?.message ?? null;
  const elementsLabel = needed ? needed.join("-") : null;

  return (
    <div className="app">
      <header className="header">
        <h1>{t("app.title")}</h1>
        <p>{t("app.subtitle")}</p>
        <div className="header-controls">
          <select
            aria-label={t("settings.language")}
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l === "ja" ? "日本語" : "English"}
              </option>
            ))}
          </select>
          <div className="segmented" role="group" aria-label={t("settings.theme")}>
            {THEMES.map((th: Theme) => (
              <button key={th} aria-pressed={theme === th} onClick={() => setTheme(th)}>
                {t(`theme.${th}`)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="stack">
          <section className="card stack">
            <h2>{t("ends.title")}</h2>
            <div className="ends">
              {endInputs.map((v, i) => (
                <label className="field" key={i}>
                  {t((["ends.top", "ends.left", "ends.right"] as const)[i])}
                  <input
                    type="text"
                    value={v}
                    spellCheck={false}
                    onChange={(e) => updateEnd(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (canUseLoaded ? computeWithLoaded : fetchAndCompute)();
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="hint">{t("ends.hint", { chemsys: elementsLabel ?? "—" })}</p>
            <label className="field">
              thermo type
              <select
                value={thermoType}
                onChange={(e) => {
                  setThermoType(e.target.value as ThermoType);
                  save(KEYS.thermoType, e.target.value);
                }}
              >
                {THERMO_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <div className="row">
              <button
                className="primary"
                onClick={fetchAndCompute}
                disabled={!!busy || !apiKey.trim()}
              >
                {t("ends.fetch")}
              </button>
              {canUseLoaded && (
                <button onClick={computeWithLoaded} disabled={!!busy}>
                  {t("ends.useLoaded")}
                </button>
              )}
            </div>
            {busy && <p className="status">{busy()}</p>}
            {shownError && <p className="error">{shownError}</p>}
          </section>

          <section className="card stack">
            <h2>{t("key.title")}</h2>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                placeholder={t("key.placeholder")}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => updateApiKey(e.target.value)}
              />
              <button onClick={() => setShowKey((s) => !s)}>
                {showKey ? t("key.hide") : t("key.show")}
              </button>
            </div>
            <p className="hint">
              {t("key.stored")}{" "}
              <a href="https://materialsproject.org/api" target="_blank" rel="noreferrer">
                {t("key.get")}
              </a>
              {apiKey && (
                <>
                  {" · "}
                  <button className="link" onClick={() => updateApiKey("")}>
                    {t("key.delete")}
                  </button>
                </>
              )}
            </p>
            {!IS_LOCAL && <p className="hint">{t("key.cors")}</p>}
          </section>

          <section className="card stack">
            <h2>{t("data.title")}</h2>
            <p className="status">{dataset ? dataset.source() : t("data.none")}</p>
            {dataset && (
              <p className="hint">
                {t("data.summary", {
                  n: dataset.docs.length,
                  elements: dataset.elements.join("-"),
                })}
              </p>
            )}
            <div className="row">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                multiple
                hidden
                onChange={loadFiles}
              />
              <button onClick={() => fileRef.current?.click()}>{t("data.loadJson")}</button>
              <button onClick={loadSample}>{t("data.sample")}</button>
            </div>
            {needed && (
              <details>
                <summary>{t("data.curl")}</summary>
                <p className="hint">{t("data.curlHint")}</p>
                <pre className="cmd">
                  {[
                    'export MP_API_KEY="<API key>"',
                    ...Array.from({ length: curlPages }, (_, i) =>
                      curlCommand(needed, thermoType, i + 1),
                    ),
                  ].join("\n")}
                </pre>
              </details>
            )}
          </section>
        </aside>

        <div className="stack">
          <main className="card diagram-card">
            {result ? (
              <>
                <div className="diagram-toolbar">
                  <div className="segmented" role="group" aria-label={t("diagram.basis")}>
                    <button aria-pressed={basis === "mol"} onClick={() => setBasis("mol")}>
                      {t("diagram.mol")}
                    </button>
                    <button aria-pressed={basis === "atom"} onClick={() => setBasis("atom")}>
                      {t("diagram.atom")}
                    </button>
                  </div>
                  <div className="row">
                    <button aria-pressed={lineMode} onClick={() => setLineMode((m) => !m)}>
                      {t("line.mode")}
                    </button>
                    <button onClick={exportSvg}>{t("diagram.saveSvg")}</button>
                  </div>
                </div>
                <div className="diagram-toolbar">
                  <label className="slider" title={t("stability.note")}>
                    {t("stability.label")} E<sub>hull</sub> ≤
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={stableMeV}
                      onChange={(e) => setStableMeV(Number(e.target.value))}
                    />
                    <span className="slider-value">{stableMeV} meV/atom</span>
                  </label>
                  <label className="slider">
                    {t("diagram.metastable")} E<sub>hull</sub> ≤
                    <input
                      type="range"
                      min={0}
                      max={200}
                      step={5}
                      value={eHullMeV}
                      onChange={(e) => setEHullMeV(Number(e.target.value))}
                    />
                    <span className="slider-value">{eHullMeV} meV/atom</span>
                  </label>
                </div>
                {stableMeV > 0 && <p className="hint">{t("stability.note")}</p>}
                <div className="diagram">
                  <Diagram
                    ref={svgRef}
                    hull={result.hull}
                    section={result.section}
                    basis={basis}
                    eHullMax={eHullMeV / 1000}
                    activeRegion={activeRegion}
                    probe={probeW}
                    onProbe={setHoverW}
                    onPin={(w) => setPinnedW(w)}
                    lineMode={lineMode}
                    line={{
                      start: lineStart,
                      end: lineEnd,
                      kinks: line ? line.kinks.map((k) => k.w) : [],
                    }}
                    onLinePoint={addLinePoint}
                  />
                </div>
                <div className="legend">
                  <span>
                    <span className="dot" style={{ background: "var(--ink)" }} />
                    {t("legend.stable")}
                  </span>
                  <span>
                    <span
                      className="dot"
                      style={{ border: "2px solid var(--meta)", background: "var(--surface)" }}
                    />
                    {t("legend.metastable")} (E<sub>hull</sub> ≤ {eHullMeV} meV/atom)
                  </span>
                  {stableMeV > 0 && (
                    <span>
                      <span
                        className="dot"
                        style={{ background: "var(--ink)", boxShadow: "0 0 0 2px var(--meta)" }}
                      />
                      {t("legend.promoted")} (E<sub>hull</sub> ≤ {stableMeV} meV/atom)
                    </span>
                  )}
                  <span>
                    <span className="swatches">
                      {REGION_FILLS.map((f) => (
                        <span key={f} className="swatch" style={{ background: f }} />
                      ))}
                    </span>
                    {t("legend.tie")}
                  </span>
                  <span>
                    <span className="swatch hatched" />
                    {t("legend.offplane")}
                  </span>
                </div>
                {result.section.coverage < 1 - 1e-4 && (
                  <p className="hint">
                    {t("diagram.coverage", { pct: pct(result.section.coverage) })}
                  </p>
                )}
                <p className="hint">
                  {!lineMode
                    ? t("diagram.hint")
                    : !lineStart
                      ? t("line.hintStart")
                      : !lineEnd
                        ? t("line.hintEnd")
                        : t("diagram.hint")}
                </p>
              </>
            ) : (
              <div className="empty">{t("diagram.empty")}</div>
            )}
          </main>
          {result && lineMode && (
            <ReactionLinePanel
              hull={result.hull}
              section={result.section}
              basis={basis}
              line={line}
              start={lineStart}
              end={lineEnd}
              options={endpointOptions}
              onSetStart={setLineStart}
              onSetEnd={setLineEnd}
              onSwap={() => {
                setLineStart(lineEnd);
                setLineEnd(lineStart);
              }}
              onClear={() => {
                setLineStart(null);
                setLineEnd(null);
              }}
              onProbe={setHoverW}
            />
          )}
        </div>

        <aside className="stack">
          {result && (
            <ProbePanel
              result={result}
              analysis={analysis}
              pinned={!!pinnedW && !hoverW}
              onSetMol={(m) => setPinnedW(molToW(m, result.section.endMembers))}
              onClear={() => setPinnedW(null)}
            />
          )}
          {result && (
            <section className="card">
              <h2>{t("regions.title", { n: result.section.regions.length })}</h2>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>{t("regions.phases")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.section.regions.map((r, i) => {
                      const onPlane = new Set(result.section.planePhases.map((p) => p.phase));
                      return (
                        <tr
                          key={i}
                          className={activeRegion === i ? "active" : undefined}
                          onMouseEnter={() => setHoverRegion(i)}
                          onMouseLeave={() => setHoverRegion(null)}
                        >
                          <td className="num">{i + 1}</td>
                          <td>
                            {r.phases.map((j, k) => (
                              <span key={j}>
                                {k > 0 && " + "}
                                <Formula f={result.hull.phases[j].entry.name} />
                                {!onPlane.has(j) && <span className="offplane-tag">*</span>}
                              </span>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="hint">{t("regions.offplane")}</p>
            </section>
          )}
          {result && <PhaseTable result={result} basis={basis} eHullMax={eHullMeV / 1000} />}
        </aside>
      </div>

      <footer>{t("app.footer")}</footer>
    </div>
  );
}

function ProbePanel({
  result,
  analysis,
  pinned,
  onSetMol,
  onClear,
}: {
  result: Computed;
  analysis: ReturnType<typeof analyzePoint> | null;
  pinned: boolean;
  onSetMol: (m: Bary) => void;
  onClear: () => void;
}) {
  const ends = result.section.endMembers;
  const [draft, setDraft] = useState<string[]>(["", "", ""]);
  const apply = () => {
    const v = draft.map((s) => Number(s) || 0);
    const s = v[0] + v[1] + v[2];
    if (!(s > 0) || v.some((x) => x < 0)) return;
    onSetMol([v[0] / s, v[1] / s, v[2] / s]);
  };
  return (
    <section className="card stack">
      <h2>
        {t("probe.title")}
        {pinned && t("probe.pinned")}
      </h2>
      {analysis ? (
        <>
          <div className="reaction">
            {analysis.mol.map((m, i) => (
              <span key={i}>
                {i > 0 && " + "}
                {fmt(m)} <Formula f={ends[i].label} />
              </span>
            ))}
            <br />→{" "}
            {analysis.products.map((p, i) => (
              <span key={p.phase}>
                {i > 0 && " + "}
                {fmt(p.moles)} <Formula f={result.hull.phases[p.phase].entry.name} />
              </span>
            ))}
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("probe.phase")}</th>
                <th className="num">mol</th>
                <th className="num">at.%</th>
              </tr>
            </thead>
            <tbody>
              {analysis.products.map((p) => (
                <tr key={p.phase}>
                  <td>
                    <Formula f={result.hull.phases[p.phase].entry.name} />
                  </td>
                  <td className="num">{fmt(p.moles)}</td>
                  <td className="num">{pct(p.atomFraction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            {t("probe.composition", {
              mol: analysis.mol.map((m) => pct(m)).join(" : "),
              atom: analysis.w.map((m) => pct(m)).join(" : "),
            })}
          </p>
          {analysis.reactionEnergy !== null && (
            <p className="status">
              {t("probe.energy", {
                mev: fmt(analysis.reactionEnergy * 1000, 1),
                kj: fmt(analysis.reactionEnergy * analysis.atomsPerMixture * 96.485, 2),
              })}
            </p>
          )}
          {pinned && (
            <button className="link" onClick={onClear} style={{ justifySelf: "start" }}>
              {t("probe.unpin")}
            </button>
          )}
        </>
      ) : (
        <p className="hint">{t("probe.empty")}</p>
      )}
      <div className="ends">
        {ends.map((e, i) => (
          <label className="field" key={i}>
            <span>
              <Formula f={e.label} /> (mol)
            </span>
            <input
              type="number"
              min={0}
              step="any"
              value={draft[i]}
              onChange={(ev) => setDraft(draft.map((s, j) => (j === i ? ev.target.value : s)))}
              onKeyDown={(ev) => ev.key === "Enter" && apply()}
            />
          </label>
        ))}
      </div>
      <button onClick={apply} style={{ justifySelf: "start" }}>
        {t("probe.show")}
      </button>
    </section>
  );
}

function PhaseTable({
  result,
  basis,
  eHullMax,
}: {
  result: Computed;
  basis: Basis;
  eHullMax: number;
}) {
  const stable = new Set(result.hull.stable);
  const rows = result.section.planePhases
    .filter((p) => stable.has(p.phase) || result.hull.phases[p.phase].eHull <= eHullMax + 1e-12)
    .sort((a, b) => result.hull.phases[a.phase].eHull - result.hull.phases[b.phase].eHull);
  return (
    <section className="card">
      <h2>{t("phases.title", { n: rows.length })}</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{t("probe.phase")}</th>
              <th>id</th>
              <th className="num">
                E<sub>hull</sub>
              </th>
              <th className="num">{basis === "mol" ? "mol%" : "at.%"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const ph = result.hull.phases[p.phase];
              const url = mpUrl(ph.entry.id);
              const b = basis === "mol" ? wToMol(p.w, result.section.endMembers) : p.w;
              return (
                <tr key={p.phase}>
                  <td>
                    <Formula f={ph.entry.name} />
                  </td>
                  <td>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        {ph.entry.id}
                      </a>
                    ) : (
                      ph.entry.id
                    )}
                  </td>
                  <td className="num">
                    {ph.eHull < 1e-9 ? "0" : fmt(ph.eHull * 1000, 0)}
                    {ph.promoted && stable.has(p.phase) && <span className="offplane-tag"> †</span>}
                  </td>
                  <td className="num">{b.map((v) => fmt(v * 100, 0)).join(":")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">{t("phases.unit")}</p>
    </section>
  );
}
