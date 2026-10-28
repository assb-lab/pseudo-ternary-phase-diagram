export type Matrix = number[][];

export function transpose(A: Matrix): Matrix {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

export function matmul(A: Matrix, B: Matrix): Matrix {
  return A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
}

export function matvec(A: Matrix, x: number[]): number[] {
  return A.map((row) => row.reduce((s, a, k) => s + a * x[k], 0));
}

/** Inverse of a small square matrix (Gauss-Jordan, partial pivoting), or null when singular. */
export function inverse(A: Matrix, tol = 1e-12): Matrix | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < tol) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const p = M[col][col];
    for (let j = 0; j < 2 * n; j++) M[col][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row.slice(n));
}

/** Left pseudo-inverse (AᵀA)⁻¹Aᵀ of a full-column-rank matrix, or null when rank-deficient. */
export function pseudoInverse(A: Matrix): Matrix | null {
  const At = transpose(A);
  const inv = inverse(matmul(At, A));
  return inv && matmul(inv, At);
}
