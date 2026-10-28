/** `30000/1001` style rates; an unreadable rate falls back to 30 fps. */
export function parseFrameRate(rate: string | undefined): number {
  const [numerator, denominator = '1'] = (rate ?? '').split('/');
  const value = Number(numerator) / Number(denominator);
  return Number.isFinite(value) && value >= 1 && value <= 120
    ? Math.round(value * 1000) / 1000
    : 30;
}
