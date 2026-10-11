export type BrandRgb = readonly [number, number, number];
export type BrandLab = readonly [number, number, number];

// D65 reference white (CIE 1931 2 degree observer).
const WHITE_X = 0.95047;
const WHITE_Y = 1;
const WHITE_Z = 1.08883;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
const RAD = Math.PI / 180;

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function pivot(value: number): number {
  return value > EPSILON ? Math.cbrt(value) : (KAPPA * value + 16) / 116;
}
function hueAngle(b: number, aPrime: number): number {
  if (b === 0 && aPrime === 0) return 0;
  const degrees = Math.atan2(b, aPrime) / RAD;
  return degrees >= 0 ? degrees : degrees + 360;
}

/** Parses `#RRGGBB`. The caller owns alpha: `#RRGGBBAA` is not a plain color. */
export function parseBrandHexColor(hex: string): BrandRgb | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}
export function formatBrandHexColor(rgb: BrandRgb): string {
  return `#${rgb
    .map((channel) =>
      Math.min(255, Math.max(0, Math.round(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

/** sRGB (0-255) to CIELAB under D65. */
export function brandRgbToLab([r, g, b]: BrandRgb): BrandLab {
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / WHITE_X;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / WHITE_Y;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / WHITE_Z;
  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 colour difference (Sharma, Wu and Dalal, 2005), kL = kC = kH = 1. */
export function brandDeltaE2000(
  [l1, a1, b1]: BrandLab,
  [l2, a2, b2]: BrandLab,
): number {
  const meanC = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);
  const hasHue = c1p * c2p !== 0;
  let dhp = 0;
  if (hasHue) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp * RAD) / 2);
  const meanLp = (l1 + l2) / 2;
  const meanCp = (c1p + c2p) / 2;
  let meanHp = h1p + h2p;
  if (hasHue) {
    meanHp =
      Math.abs(h1p - h2p) > 180
        ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2
        : (h1p + h2p) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((meanHp - 30) * RAD) +
    0.24 * Math.cos(2 * meanHp * RAD) +
    0.32 * Math.cos((3 * meanHp + 6) * RAD) -
    0.2 * Math.cos((4 * meanHp - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((meanHp - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7));
  const sl =
    1 + (0.015 * (meanLp - 50) ** 2) / Math.sqrt(20 + (meanLp - 50) ** 2);
  const sc = 1 + 0.045 * meanCp;
  const sh = 1 + 0.015 * meanCp * t;
  const rt = -Math.sin(2 * dTheta * RAD) * rc;
  return Math.sqrt(
    (dLp / sl) ** 2 +
      (dCp / sc) ** 2 +
      (dHp / sh) ** 2 +
      rt * (dCp / sc) * (dHp / sh),
  );
}
