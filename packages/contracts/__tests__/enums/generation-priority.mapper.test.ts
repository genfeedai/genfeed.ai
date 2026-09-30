import { describe, expect, it } from 'vitest';
import {
  fromRouterPriority,
  isGenerationPriority,
  toGenerationPriority,
  toRouterPriority,
} from '../../src/enums/generation-priority.mapper';
import { RouterPriority } from '../../src/enums/router.enum';
import { GenerationPriority } from '../../src/enums/setting.enum';

describe('generation-priority.mapper', () => {
  describe('toGenerationPriority', () => {
    it('accepts Prisma labels and router values alike', () => {
      expect(toGenerationPriority('QUALITY')).toBe(GenerationPriority.QUALITY);
      expect(toGenerationPriority('quality')).toBe(GenerationPriority.QUALITY);
      expect(toGenerationPriority('  Balanced  ')).toBe(
        GenerationPriority.BALANCED,
      );
      expect(toGenerationPriority(RouterPriority.SPEED)).toBe(
        GenerationPriority.SPEED,
      );
    });

    it('rejects null, empty, and unknown values', () => {
      expect(toGenerationPriority(null)).toBeUndefined();
      expect(toGenerationPriority(undefined)).toBeUndefined();
      expect(toGenerationPriority('')).toBeUndefined();
      expect(toGenerationPriority('cheapest')).toBeUndefined();
    });
  });

  describe('toRouterPriority', () => {
    it('maps the persisted Prisma label onto the router request value', () => {
      expect(toRouterPriority(GenerationPriority.QUALITY)).toBe(
        RouterPriority.QUALITY,
      );
      expect(toRouterPriority(GenerationPriority.SPEED)).toBe(
        RouterPriority.SPEED,
      );
      expect(toRouterPriority(GenerationPriority.COST)).toBe(
        RouterPriority.COST,
      );
      expect(toRouterPriority(GenerationPriority.BALANCED)).toBe(
        RouterPriority.BALANCED,
      );
    });

    it('is idempotent on values that are already router values', () => {
      expect(toRouterPriority(RouterPriority.COST)).toBe(RouterPriority.COST);
    });

    it('rejects null, empty, and unknown values', () => {
      expect(toRouterPriority(null)).toBeUndefined();
      expect(toRouterPriority(undefined)).toBeUndefined();
      expect(toRouterPriority('')).toBeUndefined();
      expect(toRouterPriority('fastest')).toBeUndefined();
    });
  });

  it('round-trips every member in both directions', () => {
    for (const priority of Object.values(GenerationPriority)) {
      const routerPriority = toRouterPriority(priority);
      expect(routerPriority).toBeDefined();

      if (routerPriority) {
        expect(fromRouterPriority(routerPriority)).toBe(priority);
      }
    }

    for (const priority of Object.values(RouterPriority)) {
      expect(toRouterPriority(fromRouterPriority(priority))).toBe(priority);
    }
  });

  it('keeps the two vocabularies distinct', () => {
    expect(Object.values(GenerationPriority)).toEqual([
      'QUALITY',
      'SPEED',
      'COST',
      'BALANCED',
    ]);
    expect(Object.values(RouterPriority)).toEqual([
      'quality',
      'speed',
      'cost',
      'balanced',
    ]);
  });

  describe('isGenerationPriority', () => {
    it('accepts only the Prisma labels', () => {
      expect(isGenerationPriority(GenerationPriority.BALANCED)).toBe(true);
      expect(isGenerationPriority(RouterPriority.BALANCED)).toBe(false);
      expect(isGenerationPriority(undefined)).toBe(false);
      expect(isGenerationPriority(42)).toBe(false);
    });
  });
});
