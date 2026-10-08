import { Platform } from '@genfeedai/contracts';
import type {
  BreakoutCapacityInput,
  LearningFormat,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { planBreakoutCapacity } from './breakout-capacity.helper';

const formats: LearningFormat[] = [
  'text',
  'image',
  'carousel',
  'video',
  'short',
  'thread',
];
function fixture(): BreakoutCapacityInput {
  return {
    source: {
      version: 1,
      organizationId: 'org-a',
      brandId: 'brand-a',
      credentialId: 'credential-a',
      platform: Platform.TWITTER,
      postId: 'post-a',
      externalId: 'tweet-a',
      format: 'video',
      publishedAt: '2026-10-08T12:00:00.000Z',
      contentDigest: 'content-a',
      publicationFingerprint: 'publication-a',
      logicalPostId: 'logical-a',
      isResponse: false,
    },
    requestedTotalOutputs: 5,
    remainingPublicationSlots: 5,
    budget: {
      remainingDailyCredits: 100,
      remainingWeeklyCredits: 100,
      remainingMonthlyCredits: 100,
      availableOrganizationCredits: 100,
      remainingPlatformCredits: 100,
      remainingPacingCredits: 100,
      remainingFormatCredits: {},
    },
    supportedFormats: formats,
    costsByFormat: Object.fromEntries(
      formats.map((format) => [
        format,
        { generationCredits: 4, qualityCredits: 1 },
      ]),
    ),
  };
}

describe('breakout capacity within existing credits and publication slots', () => {
  it('counts the quote inside five and charges its generation plus quality', () => {
    const input = fixture();
    const original = structuredClone(input);
    const plan = planBreakoutCapacity(input);
    expect(plan.status).toBe('planned');
    expect(plan.selectedTotalOutputs).toBe(5);
    expect(plan.estimatedCredits).toBe(25);
    expect(plan.slots[0]).toMatchObject({
      ordinal: 1,
      kind: 'quote',
      format: 'text',
      quoteExternalId: 'tweet-a',
      estimatedCredits: 5,
    });
    expect(
      plan.slots
        .slice(1)
        .map((slot) => [slot.kind, slot.format, slot.quoteExternalId]),
    ).toEqual(Array.from({ length: 4 }, () => ['follow_up', 'video', null]));
    expect(input).toEqual(original);
  });
  it.each(formats)(
    'preserves %s for ordinary platform follow-ups',
    (format) => {
      const input = fixture();
      input.source = { ...input.source, platform: Platform.INSTAGRAM, format };
      const plan = planBreakoutCapacity(input);
      expect(plan.slots).toHaveLength(5);
      expect(
        plan.slots.every(
          (slot) =>
            slot.kind === 'follow_up' &&
            slot.format === format &&
            slot.quoteExternalId === null,
        ),
      ).toBe(true);
    },
  );
  it('admits one quote when only one posting slot remains', () => {
    const input = fixture();
    input.remainingPublicationSlots = 1;
    const plan = planBreakoutCapacity(input);
    expect(plan.slots.map((slot) => slot.kind)).toEqual(['quote']);
    expect(plan.limits).toEqual(['quota_exhausted']);
  });
  it.each([
    'remainingDailyCredits',
    'remainingWeeklyCredits',
    'remainingMonthlyCredits',
    'availableOrganizationCredits',
    'remainingPlatformCredits',
    'remainingPacingCredits',
  ] as const)('obeys %s including quality cost', (field) => {
    const input = fixture();
    input.budget = { ...input.budget, [field]: 9 };
    const plan = planBreakoutCapacity(input);
    expect(plan.selectedTotalOutputs).toBe(1);
    expect(plan.estimatedCredits).toBe(5);
    expect(plan.limits).toEqual(['budget_exhausted']);
    input.budget = { ...input.budget, [field]: null };
    expect(planBreakoutCapacity(input)).toMatchObject({
      status: 'held',
      limits: ['budget_unavailable'],
      slots: [],
    });
  });
  it('tracks format spend separately for the quote and winning format', () => {
    const input = fixture();
    input.budget.remainingFormatCredits = { text: 5, video: 10 };
    expect(planBreakoutCapacity(input)).toMatchObject({
      selectedTotalOutputs: 3,
      estimatedCredits: 15,
      limits: ['format_cap_exhausted'],
    });
    input.source = { ...input.source, format: 'text' };
    expect(planBreakoutCapacity(input).selectedTotalOutputs).toBe(1);
  });
  it('holds unknown configured format caps and unavailable prices', () => {
    const input = fixture();
    input.budget.remainingFormatCredits = { text: null };
    expect(planBreakoutCapacity(input)).toMatchObject({
      status: 'held',
      limits: ['budget_unavailable'],
    });
    input.budget.remainingFormatCredits = {};
    input.costsByFormat = {
      text: { generationCredits: 4, qualityCredits: null },
    };
    expect(planBreakoutCapacity(input)).toMatchObject({
      status: 'held',
      limits: ['cost_unavailable'],
    });
    input.costsByFormat = { text: { generationCredits: 4, qualityCredits: 1 } };
    expect(planBreakoutCapacity(input)).toMatchObject({
      selectedTotalOutputs: 1,
      limits: ['cost_unavailable'],
    });
  });
  it('accepts explicit zero cost without inventing a price', () => {
    const input = fixture();
    input.costsByFormat = {
      text: { generationCredits: 0, qualityCredits: 0 },
      video: { generationCredits: 0, qualityCredits: 0 },
    };
    input.budget = { ...input.budget, availableOrganizationCredits: 0 };
    expect(planBreakoutCapacity(input)).toMatchObject({
      status: 'planned',
      selectedTotalOutputs: 5,
      estimatedCredits: 0,
    });
  });
  it.each([null, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'holds unreadable quota %s',
    (quota) => {
      const input = fixture();
      input.remainingPublicationSlots = quota;
      expect(planBreakoutCapacity(input)).toMatchObject({
        status: 'held',
        limits: ['quota_unavailable'],
      });
    },
  );
  it('does not generate unsupported formats or recursively respond', () => {
    const input = fixture();
    input.supportedFormats = ['video'];
    expect(planBreakoutCapacity(input).limits).toEqual(['quote_unsupported']);
    input.supportedFormats = ['text'];
    expect(planBreakoutCapacity(input).limits).toEqual(['unsupported_format']);
    input.source = { ...input.source, isResponse: true };
    expect(planBreakoutCapacity(input).limits).toEqual(['response_source']);
  });
  it.each([0, 6, 1.5, Number.NaN])(
    'rejects an invalid total output request %s',
    (count) => {
      expect(() =>
        planBreakoutCapacity({ ...fixture(), requestedTotalOutputs: count }),
      ).toThrow(RangeError);
    },
  );
});
