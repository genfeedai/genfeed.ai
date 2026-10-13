import { brandGenerationRulesV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import { GENFEED_DEFAULT_KIT_SOURCE_ID } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  buildGenfeedDefaultKitDraft,
  isGenfeedDefaultKitDraft,
  stripGenfeedDefaultKit,
} from './genfeed-default-brand-kit.helper';

const brand = { description: 'We make anvils', id: 'brand_1', label: 'Acme' };

describe('genfeed default brand kit', () => {
  it('keeps the brand name and description and supplies style only', () => {
    const draft = buildGenfeedDefaultKitDraft(brand);

    expect(draft.fields.label?.currentValue).toBe('Acme');
    expect(draft.fields.description?.currentValue).toBe('We make anvils');
    expect(draft.fields.voiceTone?.currentValue).toBe('Bold and punchy');
    expect(draft.fields.primaryColor?.currentValue).toBe('#F5EFE6');
    expect(draft.fields.backgroundColor?.currentValue).toBe('#0A0A0A');
    expect(draft.fields.fontFamily?.currentValue).toBe('Satoshi');
    expect(draft.fields.logo?.currentValue).toBeUndefined();
    expect(draft.assetCandidates).toEqual([]);
    expect(draft.sourceType).toBe('system');
  });

  it('carries only non-blocking style rules that satisfy the rules schema', () => {
    const rules = buildGenfeedDefaultKitDraft(brand).generationRules;

    expect(brandGenerationRulesV1Schema.safeParse(rules).success).toBe(true);
    expect(rules?.facts).toEqual([]);
    expect(rules?.assets).toEqual([]);
    const all = [
      ...(rules?.palette ?? []),
      ...(rules?.typography ?? []),
      ...(rules?.mandatory ?? []),
      ...(rules?.avoid ?? []),
    ];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((rule) => rule.required === false)).toBe(true);
  });

  it('detects the marker and strips it with the seeded rules', () => {
    const draft = buildGenfeedDefaultKitDraft(brand);
    expect(isGenfeedDefaultKitDraft(draft)).toBe(true);
    expect(
      draft.evidence.some(
        (entry) => entry.sourceId === GENFEED_DEFAULT_KIT_SOURCE_ID,
      ),
    ).toBe(true);

    const stripped = stripGenfeedDefaultKit(draft);
    expect(isGenfeedDefaultKitDraft(stripped)).toBe(false);
    expect(stripped.generationRules).toBeUndefined();
    expect(stripped.sourceType).toBe('manual');
    expect(draft.generationRules).toBeDefined();
  });

  it('does not treat other drafts or empty input as the default kit', () => {
    expect(isGenfeedDefaultKitDraft(undefined)).toBe(false);
    expect(isGenfeedDefaultKitDraft(null)).toBe(false);
    const own = buildGenfeedDefaultKitDraft(brand);
    own.evidence = [{ label: 'Website', sourceType: 'website' }];
    expect(isGenfeedDefaultKitDraft(own)).toBe(false);
  });
});
