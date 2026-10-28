const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "paint-order",
] as const;

/** Download the SVG with CSS variables resolved, so it renders the same outside the app. */
export function downloadSvg(svg: SVGSVGElement, filename: string): void {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll<SVGElement>("*");
  const dst = clone.querySelectorAll<SVGElement>("*");
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const style = STYLE_PROPS.map((p) => [p, cs.getPropertyValue(p)])
      // Keep pattern references (e.g. fill="url(#hatch)") as attributes: computed values are absolute URLs.
      .filter(([, v]) => !v.startsWith("url("))
      .map(([p, v]) => `${p}:${v}`)
      .join(";");
    dst[i].setAttribute("style", style);
  });
  clone.setAttribute("width", String(svg.viewBox.baseVal.width));
  clone.setAttribute("height", String(svg.viewBox.baseVal.height));
  download(new XMLSerializer().serializeToString(clone), filename, "image/svg+xml");
}

export function download(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
