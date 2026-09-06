import {
  dailySlotKey,
  selectDailySource,
  validateDailyRequest,
} from '@api/collections/workflows/services/daily-publishing.util';
import { describe, expect, it } from 'vitest';

describe('daily publishing planning', () => {
  it('uses account and local calendar date across concurrent runs', () => {
    expect(
      dailySlotKey(
        'brand',
        'account',
        'America/New_York',
        new Date('2026-09-06T01:00:00Z'),
      ),
    ).toBe('daily-publishing:brand:account:2026-09-05');
  });
  it('rejects unattended generation below the quality floor', () => {
    expect(() => validateDailyRequest({ brandId: 'b', minScore: 5 })).toThrow();
  });
  it('does not invent content when all sources are empty', () => {
    expect(() => selectDailySource([], [], [], 0)).toThrow('No usable');
  });
  it('rotates usable sources and avoids recently used provenance', () => {
    const source = {
      id: 'winner:p',
      kind: 'winner' as const,
      text: 'A useful original finding',
    };
    expect(
      selectDailySource([source], ['Useful topic'], ['winner:p'], 0),
    ).toEqual({
      id: 'topic:Useful topic',
      kind: 'topic',
      text: 'Useful topic',
    });
  });
});
