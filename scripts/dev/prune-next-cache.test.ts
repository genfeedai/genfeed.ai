import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_CACHE_GIGABYTES,
  formatGigabytes,
  type INextCacheGeneration,
  planPrune,
  selectStaleGenerations,
} from './prune-next-cache';

const GIGABYTE = 1024 ** 3;

function generation(name: string, modifiedAtMs: number): INextCacheGeneration {
  return {
    modifiedAtMs,
    path: `/repo/apps/app/.next/dev/cache/turbopack/${name}`,
  };
}

describe('prune-next-cache', () => {
  describe('formatGigabytes', () => {
    it('should render bytes as gigabytes with two decimals', () => {
      expect(formatGigabytes(13 * GIGABYTE)).toBe('13.00 GB');
    });

    it('should render a sub-gigabyte cache', () => {
      expect(formatGigabytes(GIGABYTE / 2)).toBe('0.50 GB');
    });
  });

  describe('selectStaleGenerations', () => {
    it('should return nothing when no generation exists', () => {
      expect(selectStaleGenerations([])).toEqual([]);
    });

    it('should keep a lone generation', () => {
      expect(selectStaleGenerations([generation('v16.3.4-abc', 10)])).toEqual(
        [],
      );
    });

    it('should drop every generation but the newest', () => {
      const stale = selectStaleGenerations([
        generation('v16.3.3-old', 10),
        generation('v16.3.4-new', 30),
        generation('v16.3.2-older', 5),
      ]);

      expect(stale).toEqual([
        '/repo/apps/app/.next/dev/cache/turbopack/v16.3.3-old',
        '/repo/apps/app/.next/dev/cache/turbopack/v16.3.2-older',
      ]);
    });
  });

  describe('planPrune', () => {
    it('should flag a cache above the budget', () => {
      const decision = planPrune(
        [],
        13 * GIGABYTE,
        DEFAULT_MAX_CACHE_GIGABYTES,
      );

      expect(decision.isOverBudget).toBe(true);
    });

    it('should not flag a cache at the budget', () => {
      const decision = planPrune(
        [],
        DEFAULT_MAX_CACHE_GIGABYTES * GIGABYTE,
        DEFAULT_MAX_CACHE_GIGABYTES,
      );

      expect(decision.isOverBudget).toBe(false);
    });

    it('should still report stale generations when under budget', () => {
      const decision = planPrune(
        [generation('v16.3.3-old', 1), generation('v16.3.4-new', 2)],
        GIGABYTE,
        DEFAULT_MAX_CACHE_GIGABYTES,
      );

      expect(decision.isOverBudget).toBe(false);
      expect(decision.staleGenerations).toHaveLength(1);
    });
  });
});
