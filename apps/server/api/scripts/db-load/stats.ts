/**
 * Small, dependency-free statistics for latency samples.
 *
 * Latency is right-skewed and heavy-tailed, so we report medians and
 * percentiles with bootstrap confidence intervals, and compare runs with the
 * Mann-Whitney U test (rank based, no normality assumption) instead of a
 * t-test on means. A seeded PRNG keeps reports reproducible.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export type ConfidenceInterval = { high: number; low: number };

/** Percentile bootstrap CI of an arbitrary statistic. */
export function bootstrapCi(
  xs: readonly number[],
  statistic: (sample: readonly number[]) => number,
  options: { confidence?: number; resamples?: number; seed?: number } = {},
): ConfidenceInterval {
  const { confidence = 0.95, resamples = 1000, seed = 1 } = options;
  const rand = mulberry32(seed);
  const n = xs.length;
  const stats: number[] = [];
  const buf = new Array<number>(n);
  for (let r = 0; r < resamples; r++) {
    for (let i = 0; i < n; i++) buf[i] = xs[Math.floor(rand() * n)];
    stats.push(statistic(buf));
  }
  stats.sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  return { high: quantile(stats, 1 - alpha), low: quantile(stats, alpha) };
}

const medianOf = (xs: readonly number[]): number =>
  quantile(
    [...xs].sort((a, b) => a - b),
    0.5,
  );

export type Summary = {
  max: number;
  mean: number;
  median: number;
  medianCi: ConfidenceInterval;
  min: number;
  n: number;
  p95: number;
  p99: number;
  stdev: number;
};

export function summarize(samples: readonly number[], seed = 1): Summary {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    max: sorted[sorted.length - 1],
    mean: mean(samples),
    median: quantile(sorted, 0.5),
    medianCi: bootstrapCi(samples, medianOf, { seed }),
    min: sorted[0],
    n: samples.length,
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    stdev: stdev(samples),
  };
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 on erf
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp((-z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export type MannWhitney = {
  /** P(random "after" sample < random "before" sample) + 0.5 ties. >0.5 means after is faster. */
  probabilityOfSuperiority: number;
  /** Two-sided p-value, normal approximation with tie correction. */
  pValue: number;
  u: number;
};

/** Mann-Whitney U of `after` vs `before`; "superiority" = after is faster. */
export function mannWhitney(
  before: readonly number[],
  after: readonly number[],
): MannWhitney {
  const n1 = before.length;
  const n2 = after.length;
  const all = [
    ...before.map((v) => ({ group: 0, v })),
    ...after.map((v) => ({ group: 1, v })),
  ].sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(all.length);
  let tieTerm = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = rank;
    const t = j - i + 1;
    tieTerm += t ** 3 - t;
    i = j + 1;
  }
  let r2 = 0;
  all.forEach((item, idx) => {
    if (item.group === 1) r2 += ranks[idx];
  });
  const u2 = r2 - (n2 * (n2 + 1)) / 2; // wins of "after" ranking higher (slower)
  const u1 = n1 * n2 - u2;
  const n = n1 + n2;
  const mu = (n1 * n2) / 2;
  const variance = ((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1)));
  const sd = Math.sqrt(Math.max(variance, 1e-12));
  const z = (Math.min(u1, u2) - mu) / sd;
  const pValue = Math.min(1, 2 * normalCdf(z));
  return {
    pValue,
    probabilityOfSuperiority: u1 / (n1 * n2), // before-slower-than-after share
    u: Math.min(u1, u2),
  };
}

export type Comparison = {
  /** median(before) / median(after); >1 is faster after. */
  speedup: number;
  speedupCi: ConfidenceInterval;
  mannWhitney: MannWhitney;
  /** Holm-adjusted p-value, filled by `holmAdjust`. */
  adjustedP: number;
};

export function compareSamples(
  before: readonly number[],
  after: readonly number[],
  seed = 7,
): Comparison {
  const rand = mulberry32(seed);
  const ratios: number[] = [];
  const bb = new Array<number>(before.length);
  const aa = new Array<number>(after.length);
  for (let r = 0; r < 2000; r++) {
    for (let i = 0; i < before.length; i++)
      bb[i] = before[Math.floor(rand() * before.length)];
    for (let i = 0; i < after.length; i++)
      aa[i] = after[Math.floor(rand() * after.length)];
    ratios.push(medianOf(bb) / medianOf(aa));
  }
  ratios.sort((a, b) => a - b);
  const mw = mannWhitney(before, after);
  return {
    adjustedP: mw.pValue,
    mannWhitney: mw,
    speedup: medianOf(before) / medianOf(after),
    speedupCi: { high: quantile(ratios, 0.975), low: quantile(ratios, 0.025) },
  };
}

/** Holm-Bonferroni step-down adjustment, in place. */
export function holmAdjust(comparisons: Comparison[]): void {
  const order = comparisons
    .map((c, i) => ({ i, p: c.mannWhitney.pValue }))
    .sort((a, b) => a.p - b.p);
  const m = comparisons.length;
  let running = 0;
  order.forEach(({ i, p }, rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * p));
    comparisons[i].adjustedP = running;
  });
}
