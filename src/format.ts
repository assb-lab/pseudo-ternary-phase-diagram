export function fmt(n: number, digits = 3): string {
  if (Math.abs(n) < 0.5 * 10 ** -digits) return "0";
  return Number(n.toFixed(digits)).toString();
}

export function pct(n: number): string {
  return fmt(n * 100, 1);
}
