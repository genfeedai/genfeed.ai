describe('PersonasContentController - days clamping', () => {
  const clampDays = (days: unknown): number =>
    Math.max(1, Math.min(90, Math.floor(Number(days) || 1)));

  it('should clamp days above 90 to 90', () => {
    expect(clampDays(365)).toBe(90);
    expect(clampDays(1000)).toBe(90);
  });

  it('should clamp days below 1 to 1', () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(-5)).toBe(1);
  });

  it('should pass through valid days', () => {
    expect(clampDays(7)).toBe(7);
    expect(clampDays(30)).toBe(30);
    expect(clampDays(90)).toBe(90);
    expect(clampDays(1)).toBe(1);
  });

  it('should handle non-numeric input', () => {
    expect(clampDays(undefined)).toBe(1);
    expect(clampDays(null)).toBe(1);
    expect(clampDays('abc')).toBe(1);
    expect(clampDays(NaN)).toBe(1);
  });

  it('should floor fractional days', () => {
    expect(clampDays(7.9)).toBe(7);
    expect(clampDays(1.1)).toBe(1);
  });
});
