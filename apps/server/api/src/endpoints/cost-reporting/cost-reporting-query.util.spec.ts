import { BadRequestException } from '@nestjs/common';
import { resolveCostReportRange } from './cost-reporting-query.util';

describe('resolveCostReportRange', () => {
  const now = new Date('2026-08-26T12:00:00.000Z');

  it('defaults to the trailing 30 days', () => {
    expect(resolveCostReportRange({}, now)).toEqual({
      from: new Date('2026-07-27T12:00:00.000Z'),
      to: now,
    });
  });

  it('treats date-only boundaries as inclusive UTC days', () => {
    expect(
      resolveCostReportRange({ from: '2026-08-01', to: '2026-08-05' }, now),
    ).toEqual({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-05T23:59:59.999Z'),
    });
  });

  it('rejects inverted ranges', () => {
    expect(() =>
      resolveCostReportRange({ from: '2026-08-10', to: '2026-08-01' }, now),
    ).toThrow(BadRequestException);
  });

  it('rejects ranges longer than 366 days', () => {
    expect(() =>
      resolveCostReportRange({ from: '2025-01-01', to: '2026-08-01' }, now),
    ).toThrow('Cost reports are limited to 366 days');
  });
});
