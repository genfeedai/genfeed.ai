import type {
  ModelPricingRateChange,
  ProviderBillingUnit,
  ReviewedProviderRate,
} from '@genfeedai/contracts/interfaces';

/** Prefix that marks a contract version as the hash of its normalized rates. */
export const REVIEWED_RATE_HASH_PREFIX = 'rates:sha256:';

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/**
 * Pure SHA-256. `@genfeedai/pricing` ships to the browser, so the Node `crypto`
 * module the server hash helpers use is not available here.
 */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const paddedLength = ((bytes.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor((bytes.length * 8) / 2 ** 32));
  view.setUint32(paddedLength - 4, (bytes.length * 8) >>> 0);
  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1)
      words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const w15 = words[index - 15] ?? 0;
      const w2 = words[index - 2] ?? 0;
      const sigma0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
      const sigma1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
      words[index] =
        ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) |
        0;
    }
    let [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 =
        (h +
          sum1 +
          choice +
          (SHA256_ROUND_CONSTANTS[index] ?? 0) +
          (words[index] ?? 0)) |
        0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    const next = [a, b, c, d, e, f, g, h];
    for (let index = 0; index < 8; index += 1)
      state[index] = ((state[index] ?? 0) + (next[index] ?? 0)) | 0;
  }
  return state
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

interface NormalizedProviderRate {
  component: string;
  includedUnits: number;
  isPerOutput: boolean;
  minimumUnits: number;
  roundUnitsTo: number;
  unit: ProviderBillingUnit;
  unitPriceUsd: number;
  when: Record<string, string | number | boolean>;
}

function normalizeRate(rate: ReviewedProviderRate): NormalizedProviderRate {
  return {
    component: rate.component,
    includedUnits: rate.includedUnits ?? 0,
    isPerOutput: rate.isPerOutput ?? false,
    minimumUnits: rate.minimumUnits ?? 0,
    roundUnitsTo: rate.roundUnitsTo ?? 0,
    unit: rate.unit,
    // Ten decimals keeps float noise from reading as a price change.
    unitPriceUsd: Number(rate.unitPriceUsd.toFixed(10)),
    when: { ...rate.when },
  };
}

/**
 * Stable identity of a rate set: independent of key order, rate order and of
 * absent-versus-default optional fields. Two contracts that charge the same
 * prices hash equal, whatever their schema or provider version.
 */
export function hashReviewedProviderRates(
  rates: readonly ReviewedProviderRate[],
): string {
  const canonical = rates.map((rate) => canonicalJson(normalizeRate(rate)));
  canonical.sort();
  return `${REVIEWED_RATE_HASH_PREFIX}${sha256Hex(`[${canonical.join(',')}]`)}`;
}

function variantLabel(when: Record<string, string | number | boolean>): string {
  const entries = Object.entries(when).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return entries.length
    ? entries.map(([key, value]) => `${key}=${String(value)}`).join(' · ')
    : 'all variants';
}

/** Per-variant difference between two rate sets; equal prices are omitted. */
export function describeProviderRateChanges(
  oldRates: readonly ReviewedProviderRate[],
  newRates: readonly ReviewedProviderRate[],
): ModelPricingRateChange[] {
  const keyOf = (rate: ReviewedProviderRate) =>
    canonicalJson([rate.component, rate.unit, rate.when]);
  const previous = new Map(oldRates.map((rate) => [keyOf(rate), rate]));
  const next = new Map(newRates.map((rate) => [keyOf(rate), rate]));
  const changes: ModelPricingRateChange[] = [];
  for (const [key, rate] of next) {
    const before = previous.get(key);
    if (
      before &&
      normalizeRate(before).unitPriceUsd === normalizeRate(rate).unitPriceUsd
    )
      continue;
    changes.push({
      component: rate.component,
      newPriceUsd: rate.unitPriceUsd,
      oldPriceUsd: before?.unitPriceUsd ?? null,
      unit: rate.unit,
      variant: variantLabel(rate.when),
    });
  }
  for (const [key, rate] of previous) {
    if (next.has(key)) continue;
    changes.push({
      component: rate.component,
      newPriceUsd: null,
      oldPriceUsd: rate.unitPriceUsd,
      unit: rate.unit,
      variant: variantLabel(rate.when),
    });
  }
  return changes;
}
