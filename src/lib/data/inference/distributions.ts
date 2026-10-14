/**
 * Probability distributions for the inferential tests (docs/papers.md §9, D24). Pure TypeScript, no dependencies,
 * deterministic. Accuracy target: relative error < 1e-10 against scipy for p-values above 1e-300 (validated with
 * df from 1 to 10⁴, see the report of `src/lib/data/inference/`).
 *
 * Tails are always computed directly (never as 1 − the other tail), so a survival probability of 1e-200 keeps its
 * digits and a p-value close to 1 does too.
 */

const EPS = 1e-16;
const FPMIN = 1e-300;
const MAX_ITER = 100000;
const LN_SQRT_2PI = 0.9189385332046728; // ln √(2π)
const SQRT_2PI = 2.5066282746310002;

/** Lanczos coefficients (g = 671/128, 14 terms; Numerical Recipes, 3rd ed., §6.1). */
const LANCZOS = [
  57.1562356658629235, -59.5979603554754912, 14.1360979747417471, -0.491913816097620199, 0.339946499848118887e-4,
  0.465236289270485756e-4, -0.983744753048795646e-4, 0.158088703224912494e-3, -0.210264441724104883e-3,
  0.217439618115212643e-3, -0.164318106536763890e-3, 0.844182239838527433e-4, -0.261908384015814087e-4,
  0.368991826595316234e-5,
];

/** ln Γ(x) for x > 0 (Lanczos approximation, about 15 significant digits); NaN otherwise. */
export function lnGamma(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return x === Infinity ? Infinity : NaN;
  let y = x;
  let tmp = x + 5.2421875;
  tmp = (x + 0.5) * Math.log(tmp) - tmp;
  let ser = 0.999999999999997092;
  for (let j = 0; j < LANCZOS.length; j++) ser += LANCZOS[j] / ++y;
  return tmp + Math.log((SQRT_2PI * ser) / x);
}

/** ln B(a, b) = ln Γ(a) + ln Γ(b) − ln Γ(a + b). */
export function lnBeta(a: number, b: number): number {
  return lnGamma(a) + lnGamma(b) - lnGamma(a + b);
}

/** Continued fraction of the incomplete beta function (modified Lentz). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= EPS) break;
  }
  return h;
}

/**
 * Both tails of the regularized incomplete beta function: [I_x(a, b), 1 − I_x(a, b)], each computed without
 * cancellation. `y` must be 1 − x computed by the caller as accurately as it can (e.g. t²/(ν + t²)).
 */
export function betaIncTails(a: number, b: number, x: number, y: number = 1 - x): [number, number] {
  if (!(a > 0) || !(b > 0) || Number.isNaN(x) || Number.isNaN(y)) return [NaN, NaN];
  if (x <= 0) return [0, 1];
  if (y <= 0) return [1, 0];
  const lnFront = a * Math.log(x) + b * Math.log(y) - lnBeta(a, b);
  if (x < (a + 1) / (a + b + 2)) {
    const v = (Math.exp(lnFront) * betaContinuedFraction(a, b, x)) / a;
    return [v, 1 - v];
  }
  const v = (Math.exp(lnFront) * betaContinuedFraction(b, a, y)) / b;
  return [1 - v, v];
}

/** Regularized incomplete beta I_x(a, b). */
export function betaInc(x: number, a: number, b: number): number {
  return betaIncTails(a, b, x, 1 - x)[0];
}

/** Series of the lower regularized incomplete gamma P(a, x) (use for x < a + 1). */
function gammaSeries(a: number, x: number): number {
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 0; n < MAX_ITER; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

/** Continued fraction of the upper regularized incomplete gamma Q(a, x) (modified Lentz; use for x ≥ a + 1). */
function gammaContinuedFraction(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_ITER; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Both tails of the regularized incomplete gamma function: [P(a, x), Q(a, x)], each without cancellation. */
export function gammaIncTails(a: number, x: number): [number, number] {
  if (!(a > 0) || Number.isNaN(x)) return [NaN, NaN];
  if (x <= 0) return [0, 1];
  if (x === Infinity) return [1, 0];
  if (x < a + 1) {
    const p = gammaSeries(a, x);
    return [p, 1 - p];
  }
  const q = gammaContinuedFraction(a, x);
  return [1 - q, q];
}

/** Lower regularized incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  return gammaIncTails(a, x)[0];
}

/** Upper regularized incomplete gamma Q(a, x) = 1 − P(a, x). */
export function gammaQ(a: number, x: number): number {
  return gammaIncTails(a, x)[1];
}

/** Complementary error function erfc(x), via erfc(x) = Q(½, x²) for x ≥ 0 (full double precision in the tail). */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x >= 0) return gammaIncTails(0.5, x * x)[1];
  return 1 + gammaIncTails(0.5, x * x)[0];
}

/** Error function erf(x). */
export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const p = gammaIncTails(0.5, x * x)[0];
  return x >= 0 ? p : -p;
}

/** Standard normal density φ(z). */
export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z - LN_SQRT_2PI);
}

/** Standard normal upper tail P(Z > z). */
export function normalSf(z: number): number {
  if (Number.isNaN(z)) return NaN;
  const x = Math.abs(z) / Math.SQRT2;
  const [lower, upper] = gammaIncTails(0.5, x * x); // erf(|x|), erfc(|x|)
  return z >= 0 ? 0.5 * upper : 0.5 + 0.5 * lower;
}

/** Standard normal CDF P(Z ≤ z). */
export function normalCdf(z: number): number {
  return normalSf(-z);
}

/** Student t density with ν degrees of freedom. */
export function tPdf(t: number, df: number): number {
  return Math.exp(lnGamma((df + 1) / 2) - lnGamma(df / 2) - 0.5 * Math.log(df * Math.PI) - ((df + 1) / 2) * Math.log1p((t * t) / df));
}

/** Student t: [P(T ≤ t), P(T > t)], ν > 0 (not necessarily an integer, as in Welch's test). */
export function tTails(t: number, df: number): [number, number] {
  if (Number.isNaN(t) || !(df > 0)) return [NaN, NaN];
  if (t === Infinity) return [1, 0];
  if (t === -Infinity) return [0, 1];
  const t2 = t * t;
  // P(|T| > |t|) = I_x(ν/2, ½) with x = ν/(ν + t²); y = 1 − x = t²/(ν + t²) computed directly.
  const [both, inner] = betaIncTails(df / 2, 0.5, df / (df + t2), t2 / (df + t2));
  const tail = 0.5 * both;
  const body = 0.5 + 0.5 * inner;
  return t >= 0 ? [body, tail] : [tail, body];
}

/** Student t CDF P(T ≤ t). */
export function tCdf(t: number, df: number): number {
  return tTails(t, df)[0];
}

/** Student t survival P(T > t). */
export function tSf(t: number, df: number): number {
  return tTails(t, df)[1];
}

/** Two-sided p-value of a t statistic: P(|T| ≥ |t|). */
export function tTwoSided(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (!Number.isFinite(t)) return 0;
  const t2 = t * t;
  return Math.min(1, betaIncTails(df / 2, 0.5, df / (df + t2), t2 / (df + t2))[0]);
}

/** F distribution: [P(F ≤ f), P(F > f)] with (d1, d2) degrees of freedom. */
export function fTails(f: number, d1: number, d2: number): [number, number] {
  if (Number.isNaN(f) || !(d1 > 0) || !(d2 > 0)) return [NaN, NaN];
  if (f <= 0) return [0, 1];
  if (f === Infinity) return [1, 0];
  const den = d2 + d1 * f;
  // P(F > f) = I_x(d2/2, d1/2) with x = d2/(d2 + d1 f).
  const [upper, lower] = betaIncTails(d2 / 2, d1 / 2, d2 / den, (d1 * f) / den);
  return [lower, upper];
}

/** F CDF. */
export function fCdf(f: number, d1: number, d2: number): number {
  return fTails(f, d1, d2)[0];
}

/** F survival P(F > f) (the p-value of an F test). */
export function fSf(f: number, d1: number, d2: number): number {
  return fTails(f, d1, d2)[1];
}

/** Chi-square: [P(X ≤ x), P(X > x)] with k degrees of freedom. */
export function chiSquareTails(x: number, k: number): [number, number] {
  if (Number.isNaN(x) || !(k > 0)) return [NaN, NaN];
  if (x <= 0) return [0, 1];
  return gammaIncTails(k / 2, x / 2);
}

/** Chi-square CDF. */
export function chiSquareCdf(x: number, k: number): number {
  return chiSquareTails(x, k)[0];
}

/** Chi-square survival P(X > x) (the p-value of a χ² or Kruskal–Wallis test). */
export function chiSquareSf(x: number, k: number): number {
  return chiSquareTails(x, k)[1];
}

/** Acklam's rational approximation of the lower-tail normal quantile (relative error < 1.2e-9), p in (0, 0.5]. */
function acklamLower(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Standard normal quantile Φ⁻¹(p) (Acklam start + Newton on the exact tail; full double precision). */
export function normalQuantile(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  // Solve in the smaller tail q = min(p, 1 − p) for x > 0 with P(Z > x) = q, then restore the sign.
  const upper = p > 0.5;
  const q = upper ? 1 - p : p;
  let x = -acklamLower(q);
  for (let i = 0; i < 50; i++) {
    const step = (normalSf(x) - q) / normalPdf(x);
    x += step;
    if (Math.abs(step) <= 1e-15 * Math.abs(x)) break;
  }
  return upper ? x : -x;
}

/** Student t quantile: t with P(T ≤ t) = p (safeguarded Newton on the exact tail; ν > 0). */
export function tQuantile(p: number, df: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1 || !(df > 0)) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  const upper = p > 0.5;
  const q = upper ? 1 - p : p; // target upper tail, q < 0.5
  // Start: Cornish–Fisher expansion around the normal quantile, then bracket [lo, hi] with tSf(lo) ≥ q > tSf(hi).
  const z = normalQuantile(1 - q);
  const z2 = z * z;
  let x = z + (z * (z2 + 1)) / (4 * df) + (z * ((5 * z2 + 16) * z2 + 3)) / (96 * df * df);
  if (!(x > 0) || !Number.isFinite(x)) x = z;
  let lo = 0;
  let hi = Math.max(x, 1);
  while (tSf(hi, df) > q && hi < 1e300) {
    lo = hi;
    hi *= 2;
  }
  if (!(x > lo && x < hi)) x = 0.5 * (lo + hi);
  for (let i = 0; i < 300; i++) {
    const f = tSf(x, df) - q;
    if (f === 0) break;
    if (f > 0) lo = x;
    else hi = x;
    let next = x + f / tPdf(x, df);
    if (!(next > lo && next < hi) || !Number.isFinite(next)) next = 0.5 * (lo + hi);
    const step = next - x;
    x = next;
    if (Math.abs(step) <= 1e-15 * Math.abs(x) || hi - lo <= 1e-15 * hi) break;
  }
  return upper ? x : -x;
}
