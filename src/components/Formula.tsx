/** Split "Li3PS4" into text and subscript runs. */
function runs(formula: string): { text: string; sub: boolean }[] {
  return formula
    .split(/(\d+(?:\.\d+)?)/)
    .filter(Boolean)
    .map((text) => ({ text, sub: /^\d/.test(text) }));
}

/** Chemical formula with HTML subscripts. */
export function Formula({ f }: { f: string }) {
  return (
    <>
      {runs(f).map((r, i) => (r.sub ? <sub key={i}>{r.text}</sub> : <span key={i}>{r.text}</span>))}
    </>
  );
}

/** Chemical formula as SVG tspans (place inside a <text>). */
export function SvgFormula({ f }: { f: string }) {
  return (
    <>
      {runs(f).map((r, i) =>
        r.sub ? (
          <tspan key={i} baselineShift="-25%" fontSize="0.72em">
            {r.text}
          </tspan>
        ) : (
          <tspan key={i}>{r.text}</tspan>
        ),
      )}
    </>
  );
}
