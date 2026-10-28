import type { MessageKey } from "./ja";

export const en: Record<MessageKey, string> = {
  "app.title": "Pseudo-ternary phase diagram",
  "app.subtitle":
    "Stable phases on a section spanned by any three compounds, from Materials Project DFT energies",
  "app.footer":
    "Data: Materials Project (CC BY 4.0) — A. Jain et al., APL Mater. 1, 011002 (2013). Energies are 0 K DFT values without temperature or entropy effects.",

  "settings.language": "Language",
  "settings.theme": "Theme",
  "theme.auto": "Auto",
  "theme.light": "Light",
  "theme.dark": "Dark",

  "ends.title": "End members",
  "ends.top": "Top (A)",
  "ends.left": "Bottom left (B)",
  "ends.right": "Bottom right (C)",
  "ends.hint":
    "Compounds or elements (e.g. Li2S / P2S5 / LiCl, Li / P / S). Chemical system: {chemsys}",
  "ends.fetch": "Fetch from MP & compute",
  "ends.useLoaded": "Compute with loaded data",

  "key.title": "Materials Project API key",
  "key.placeholder": "Paste your API key",
  "key.show": "Show",
  "key.hide": "Hide",
  "key.stored": "The key is stored only in this browser's localStorage.",
  "key.get": "Get a key",
  "key.delete": "Delete",
  "key.cors":
    "The MP API does not allow direct browser requests (CORS), so fetching may fail on a hosted site. In that case, download the JSON with the curl command below and load it.",

  "data.title": "Data",
  "data.none": "Nothing loaded",
  "data.summary": "{n} entries · elements {elements}",
  "data.loadJson": "Load JSON",
  "data.sample": "Sample (Li-P-S-Cl)",
  "data.sampleSource": "Sample: Materials Project Cl-Li-P-S (GGA_GGA+U_R2SCAN)",
  "data.curl": "Download with curl",
  "data.curlHint":
    "Set your key in the MP_API_KEY environment variable, run the command, and load the saved JSON. Each file holds up to 1000 entries; if pages are missing, the commands for every page are shown on import.",

  "busy.fetching": "Fetching from Materials Project…",
  "busy.progress": "Fetching… {n}{total} entries",

  "diagram.mol": "Mole fraction",
  "diagram.atom": "Atomic fraction",
  "diagram.basis": "Coordinates",
  "diagram.metastable": "Metastable",
  "diagram.saveSvg": "Save SVG",
  "diagram.ariaLabel": "{system} pseudo-ternary phase diagram",
  "diagram.axisMol": "mol%",
  "diagram.axisAtom": "at.%",
  "legend.stable": "Stable phase",
  "legend.metastable": "Metastable phase",
  "legend.tie": "Phase regions (four-colored: neighbours differ)",
  "legend.offplane": "Hatched: equilibrium including off-section phases",
  "diagram.coverage":
    "Note: the detected regions cover only {pct}% of the triangle (very thin regions may be missing).",
  "diagram.hint": "Hover to see decomposition products; click to pin.",
  "diagram.empty": "Enter end members and press “Fetch from MP & compute”, or load the sample.",

  "regions.title": "Phase regions ({n})",
  "regions.phases": "Equilibrium phases",
  "regions.offplane": "* off-section phase",

  "probe.title": "Decomposition products",
  "probe.pinned": " (pinned)",
  "probe.phase": "Phase",
  "probe.composition": "Composition (mol%): {mol} · atomic fraction: {atom}",
  "probe.energy": "Reaction energy from end members: {mev} meV/atom ({kj} kJ/mol)",
  "probe.unpin": "Unpin",
  "probe.empty": "Hover or click on the diagram, or enter a composition.",
  "probe.show": "Show this composition",

  "phases.title": "Phases on the section ({n})",
  "phases.phase": "Phase",
  "phases.unit": "E_hull in meV/atom (from the loaded data). † treated as stable.",

  "line.mode": "Reaction line",
  "line.title": "Reaction line",
  "line.hintStart": "Click the diagram to set the start S (snaps to phases and corners).",
  "line.hintEnd": "Now click the end E.",
  "line.start": "Start S",
  "line.end": "End E",
  "line.choose": "Choose…",
  "line.mixture": "Mixture ({comp} mol%)",
  "line.swap": "Swap",
  "line.clear": "Clear",
  "line.xMol": "x (mole fraction of E)",
  "line.xAtom": "x (atomic fraction of E)",
  "line.reaction": "Reaction (1−x) S + x E → products",
  "line.min": "min",
  "line.chartLabel": "Reaction energy vs mixing ratio",
  "line.energyNote":
    "ΔE (meV/atom): energy of the equilibrium state relative to the unreacted mixture of S and E. More negative means a stronger driving force; the highlighted row is the most reactive ratio. Compounds are referenced to their own entry energy, mixtures to the hull. Rows are the ratios where the equilibrium phase set changes.",

  "stability.label": "Treat as stable",
  "stability.note":
    "Metastable phases with E_hull up to this value are placed just below the hull (0.1 meV/atom) and treated as stable.",
  "legend.promoted": "Metastable treated as stable",

  "err.noThermoType": "The loaded data has no entries of thermo type {type}",
  "err.noEntries": "No entries were returned",
  "err.jsonEmpty": "The JSON contains no entries",
  "err.jsonFailed": "Failed to load JSON: {msg}",

  "formula.empty": "Empty formula",
  "formula.unparsable": "Cannot parse formula: {formula} (at character {pos})",
  "formula.number": "Misplaced number: {formula}",
  "formula.brackets": "Unbalanced brackets: {formula}",
  "formula.emptyGroup": "Empty brackets: {formula}",
  "formula.noElements": "No elements: {formula}",

  "hull.missingRefs": "Missing elemental entries: {elements}",
  "section.needThree": "Exactly three end members are required",
  "section.collinear": "The three end members are collinear (compositions are not independent)",

  "mp.noKey": "Enter your API key",
  "mp.network":
    "Could not reach the MP API. It does not allow direct browser requests (CORS); run the app with `vp dev` / `vp preview`, or load JSON downloaded with the curl command.",
  "mp.http": "MP API error: HTTP {status}{hint}",
  "mp.httpKeyHint": " (check your API key)",
  "mp.noData": "The MP API response has no data",
  "mp.incomplete":
    "The JSON is missing entries ({loaded} / {total}). Download all {pages} files (_page=1–{pages}) and select them together.",
  "mp.noDataArray": "The JSON has no data array",
  "mp.badDoc": "Not a thermo document",
};
