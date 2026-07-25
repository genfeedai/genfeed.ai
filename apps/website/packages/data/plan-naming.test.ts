import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlanTier } from '@helpers/business/pricing/pricing.helper';
import {
  getPlanByTier,
  getPlanLabel,
  PLAN_COPY,
  PLAN_LABELS,
  websitePlans,
} from '@helpers/business/pricing/pricing.helper';
import { describe, expect, it } from 'vitest';
import { products } from './products.data';
import { useCases } from './use-cases.data';

const TIERS = Object.keys(PLAN_LABELS) as PlanTier[];

const DATA_DIR = fileURLToPath(new URL('.', import.meta.url));

/**
 * Every marketing surface that names or prices a plan in prose. The site once
 * shipped two contradictory names for the same two plans because these files
 * spelled the names out by hand; they must interpolate PLAN_COPY instead, so a
 * rename or a price change in @genfeedai/pricing propagates on its own.
 */
const COPY_SOURCES = [
  'faq.data.ts',
  'products.data.ts',
  'use-cases.data.ts',
  '../ui/marketing/PricingStrip.tsx',
  '../../app/(public)/pricing/page.tsx',
  '../../app/(public)/pricing/pricing-content.tsx',
  '../../scripts/generate-llms-txt.ts',
];

/** Digits only, so the assertion survives any change to number formatting. */
function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

describe('plan naming', () => {
  it('exposes exactly one plan per tier', () => {
    expect(websitePlans.map((plan) => plan.tier).sort()).toEqual(
      [...TIERS].sort(),
    );
  });

  it('takes every plan label from PLAN_LABELS', () => {
    for (const plan of websitePlans) {
      expect(plan.label).toBe(PLAN_LABELS[plan.tier]);
      expect(getPlanByTier(plan.tier)).toBe(plan);
      expect(getPlanLabel(plan.tier)).toBe(plan.label);
    }
  });

  it('derives every PLAN_COPY token from its plan record', () => {
    for (const tier of TIERS) {
      const plan = getPlanByTier(tier);
      const copy = PLAN_COPY[tier];

      expect(copy.name).toBe(plan.label);
      expect(copy.nameWithPrice).toBe(`${copy.name} (${copy.monthlyPrice})`);

      if (plan.price == null) {
        expect(copy.monthlyPrice).toBe('custom');
        expect(copy.priceLabel).toBe('Custom');
      } else if (plan.price === 0) {
        expect(copy.monthlyPrice).toBe('free');
        expect(copy.priceLabel).toBe('Free');
      } else {
        expect(digitsOf(copy.monthlyPrice)).toBe(String(plan.price));
        expect(digitsOf(copy.priceLabel)).toBe(String(plan.price));
      }

      if (plan.includedCredits == null) {
        expect(copy.includedCredits).toBe('');
      } else {
        expect(copy.includedCredits).toMatch(/^[\d,]+ credits$/);
        expect(digitsOf(copy.includedCredits)).toBe(
          String(plan.includedCredits),
        );
      }
    }
  });

  it('recommends only tiers that exist', () => {
    for (const product of products) {
      expect(() => getPlanByTier(product.pricing.recommended)).not.toThrow();
    }

    for (const useCase of useCases) {
      expect(() => getPlanByTier(useCase.pricing.recommended)).not.toThrow();
    }
  });

  it('keeps plan prices and credit counts out of marketing copy', () => {
    const banned = new Set<string>();

    for (const plan of websitePlans) {
      if (plan.price != null && plan.price > 0) {
        banned.add(`$${plan.price}`);
        banned.add(`$${plan.price.toLocaleString('en-US')}`);
      }

      if (plan.includedCredits != null) {
        banned.add(String(plan.includedCredits));
        banned.add(plan.includedCredits.toLocaleString('en-US'));
      }
    }

    const offenders: string[] = [];

    for (const relativePath of COPY_SOURCES) {
      const source = readFileSync(join(DATA_DIR, relativePath), 'utf8');

      for (const literal of banned) {
        if (source.includes(literal)) {
          offenders.push(`${relativePath} hardcodes "${literal}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
