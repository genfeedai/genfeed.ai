import {
  type AgentSourceAllocationContext,
  type AgentSourceAllocationReceipt,
  agentSourceAllocationContextSchema,
  agentSourceAllocationReceiptSchema,
  type PrepareSavedAdSourceAllocation,
  prepareSavedAdSourceAllocationSchema,
} from '@genfeedai/contracts/api-types/contracts/agent-source-allocation.contract';
import {
  type BrandRemixDraft,
  BrandRemixOrganicPlatform,
  brandRemixDraftSchema,
  savedAdRemixSourceSelectorSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';

const timestamp = '2026-10-02T12:00:00.000Z';
function context(): AgentSourceAllocationContext {
  return { organizationId: 'org-A', actorUserId: 'actor-A' };
}
function input(): PrepareSavedAdSourceAllocation {
  return {
    brandId: 'brand-A',
    strategyId: 'strategy-A',
    executionId: 'execution-A',
    savedAdId: 'saved-A',
    expectedSourceUpdatedAt: timestamp,
    freshnessWindowMs: 1000,
    draft: {
      fidelityMode: 'guided',
      identity: {},
      intent: { objective: 'Write an organic draft.' },
      output: { kind: 'copy', count: 1 },
      references: [],
      reviewRequired: true,
      target: {
        kind: 'organic',
        platform: BrandRemixOrganicPlatform.INSTAGRAM,
      },
    },
  };
}
function receipt(): AgentSourceAllocationReceipt {
  const request = input();
  return {
    ...context(),
    allocationId: 'allocation-A',
    brandId: request.brandId,
    strategyId: request.strategyId,
    executionId: request.executionId,
    sourceKind: 'saved_ad',
    sourceId: request.savedAdId,
    remixRunId: 'remix-A',
    allocationInputHash: 'abcdef0123456789'.repeat(4),
    createdAt: timestamp,
  };
}

describe('Agent source allocation structural checkpoint', () => {
  it('accepts separate explicit context, copy organic input and an immutable scalar receipt', () => {
    expect(agentSourceAllocationContextSchema.parse(context())).toEqual(
      context(),
    );
    expect(prepareSavedAdSourceAllocationSchema.parse(input())).toEqual(
      input(),
    );
    const original = receipt();
    const parsed = agentSourceAllocationReceiptSchema.parse(original);
    expect(parsed).toEqual(original);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Reflect.set(parsed, 'actorUserId', 'other')).toBe(false);
    expect(Reflect.deleteProperty(parsed, 'sourceId')).toBe(false);
    expect(Reflect.set(original, 'sourceId', 'mutated')).toBe(true);
    expect(parsed.sourceId).toBe('saved-A');
  });
  it('inherits canonical trimmed opaque IDs and their exact grammar and length boundaries', () => {
    for (const id of ['a', 'A0._:-z', 'a'.repeat(255), '  org-A  ']) {
      const canonical =
        savedAdRemixSourceSelectorSchema.shape.savedAdId.parse(id);
      expect(
        agentSourceAllocationContextSchema.parse({
          ...context(),
          organizationId: id,
        }).organizationId,
      ).toBe(canonical);
      for (const field of [
        'brandId',
        'strategyId',
        'executionId',
        'savedAdId',
      ] as const)
        expect(
          prepareSavedAdSourceAllocationSchema.parse({
            ...input(),
            [field]: id,
          })[field],
        ).toBe(canonical);
      for (const field of [
        'allocationId',
        'organizationId',
        'brandId',
        'strategyId',
        'executionId',
        'actorUserId',
        'sourceId',
        'remixRunId',
      ] as const)
        expect(
          agentSourceAllocationReceiptSchema.parse({
            ...receipt(),
            [field]: id,
          })[field],
        ).toBe(canonical);
    }
    for (const id of [
      '',
      ' ',
      '_leading',
      'embedded space',
      'slash/id',
      'ümlaut',
      'a'.repeat(256),
    ]) {
      expect(
        savedAdRemixSourceSelectorSchema.shape.savedAdId.safeParse(id).success,
      ).toBe(false);
      for (const field of ['organizationId', 'actorUserId'])
        expect(
          agentSourceAllocationContextSchema.safeParse({
            ...context(),
            [field]: id,
          }).success,
        ).toBe(false);
      for (const field of ['brandId', 'strategyId', 'executionId', 'savedAdId'])
        expect(
          prepareSavedAdSourceAllocationSchema.safeParse({
            ...input(),
            [field]: id,
          }).success,
        ).toBe(false);
      for (const field of [
        'allocationId',
        'organizationId',
        'brandId',
        'strategyId',
        'executionId',
        'actorUserId',
        'sourceId',
        'remixRunId',
      ])
        expect(
          agentSourceAllocationReceiptSchema.safeParse({
            ...receipt(),
            [field]: id,
          }).success,
        ).toBe(false);
    }
  });
  it('accepts real offset timestamps and rejects impossible dates and missing timezone', () => {
    for (const value of [
      timestamp,
      '2024-02-29T12:30:00+02:00',
      '2026-10-02T06:30:00-05:30',
    ]) {
      expect(
        prepareSavedAdSourceAllocationSchema.parse({
          ...input(),
          expectedSourceUpdatedAt: value,
        }).expectedSourceUpdatedAt,
      ).toBe(value);
      expect(
        agentSourceAllocationReceiptSchema.parse({
          ...receipt(),
          createdAt: value,
        }).createdAt,
      ).toBe(value);
    }
    for (const value of [
      'invalid',
      '2026-02-29T12:00:00Z',
      '2026-02-30T12:00:00Z',
      '2026-13-01T12:00:00Z',
      '2026-10-02T24:00:00Z',
      '2026-10-02T12:00:00',
      0,
      NaN,
      Infinity,
    ]) {
      expect(
        prepareSavedAdSourceAllocationSchema.safeParse({
          ...input(),
          expectedSourceUpdatedAt: value,
        }).success,
      ).toBe(false);
      expect(
        agentSourceAllocationReceiptSchema.safeParse({
          ...receipt(),
          createdAt: value,
        }).success,
      ).toBe(false);
    }
  });
  it('requires every context, request and receipt field without adding defaults', () => {
    for (const field of Object.keys(context()))
      expect(
        agentSourceAllocationContextSchema.safeParse({
          ...context(),
          [field]: undefined,
        }).success,
      ).toBe(false);
    for (const field of Object.keys(input()))
      expect(
        prepareSavedAdSourceAllocationSchema.safeParse({
          ...input(),
          [field]: undefined,
        }).success,
      ).toBe(false);
    for (const field of Object.keys(receipt()))
      expect(
        agentSourceAllocationReceiptSchema.safeParse({
          ...receipt(),
          [field]: undefined,
        }).success,
      ).toBe(false);
  });
  it('requires explicit finite positive freshness without a product cap or clock comparison', () => {
    for (const value of [
      undefined,
      null,
      0,
      -1,
      NaN,
      Infinity,
      -Infinity,
      '1000',
    ])
      expect(
        prepareSavedAdSourceAllocationSchema.safeParse({
          ...input(),
          freshnessWindowMs: value,
        }).success,
      ).toBe(false);
    for (const value of [0.5, 1000, Number.MAX_VALUE])
      expect(
        prepareSavedAdSourceAllocationSchema.parse({
          ...input(),
          freshnessWindowMs: value,
        }).freshnessWindowMs,
      ).toBe(value);
    expect(
      prepareSavedAdSourceAllocationSchema.parse({
        ...input(),
        expectedSourceUpdatedAt: '2099-01-01T00:00:00Z',
      }).expectedSourceUpdatedAt,
    ).toBe('2099-01-01T00:00:00Z');
  });
  it('requires count, platform, objective, review, fidelity and identity explicitly', () => {
    const { draft } = input();
    const invalidDrafts: unknown[] = [
      { ...draft, output: { kind: 'copy' } },
      { ...draft, target: { kind: 'organic' } },
      { ...draft, intent: {} },
      ...['reviewRequired', 'fidelityMode', 'identity'].map((field) => ({
        ...draft,
        [field]: undefined,
      })),
    ];
    for (const value of invalidDrafts)
      expect(
        prepareSavedAdSourceAllocationSchema.safeParse({
          ...input(),
          draft: value,
        }).success,
      ).toBe(false);
    for (const count of [0, -1, 1.5, 9, NaN, Infinity])
      expect(
        prepareSavedAdSourceAllocationSchema.safeParse({
          ...input(),
          draft: { ...draft, output: { kind: 'copy', count } },
        }).success,
      ).toBe(false);
    for (const count of [1, 8])
      expect(
        prepareSavedAdSourceAllocationSchema.parse({
          ...input(),
          draft: { ...draft, output: { kind: 'copy', count } },
        }).draft.output.count,
      ).toBe(count);
    for (const objective of ['', '  ', 'a'.repeat(10001)])
      expect(
        prepareSavedAdSourceAllocationSchema.safeParse({
          ...input(),
          draft: { ...draft, intent: { objective } },
        }).success,
      ).toBe(false);
    expect(
      prepareSavedAdSourceAllocationSchema.parse({
        ...input(),
        draft: { ...draft, intent: { objective: 'a'.repeat(10000) } },
      }).draft.intent.objective,
    ).toHaveLength(10000);
  });
  it('narrows canonical output and target without allowing paid, non-copy or unreviewed drafts', () => {
    const { draft } = input();
    for (const output of [
      { kind: 'image', count: 1, aspectRatio: '1:1' },
      { kind: 'video', count: 1, aspectRatio: '16:9' },
      { kind: 'avatar', count: 1, aspectRatio: '9:16' },
    ]) {
      expect(
        brandRemixDraftSchema.safeParse({ ...draft, output }).success,
      ).toBe(true);
      expect(
        prepareSavedAdSourceAllocationSchema.safeParse({
          ...input(),
          draft: { ...draft, output },
        }).success,
      ).toBe(false);
    }
    const paid = { ...draft, target: { kind: 'paid', platform: 'meta' } };
    expect(brandRemixDraftSchema.safeParse(paid).success).toBe(true);
    expect(
      prepareSavedAdSourceAllocationSchema.safeParse({
        ...input(),
        draft: paid,
      }).success,
    ).toBe(false);
    expect(
      prepareSavedAdSourceAllocationSchema.safeParse({
        ...input(),
        draft: { ...draft, reviewRequired: false },
      }).success,
    ).toBe(false);
    expect(
      prepareSavedAdSourceAllocationSchema.safeParse({
        ...input(),
        draft: { ...draft, target: { kind: 'organic', platform: 'meta' } },
      }).success,
    ).toBe(false);
  });
  it('preserves strict canonical identity, intent and reference validation', () => {
    const { draft } = input();
    const reference = { assetId: 'asset-A', source: 'explicit', role: 'style' };
    const valid = {
      ...draft,
      identity: { avatarAssetId: 'avatar-A', speechVoiceId: 'voice-A' },
      references: [reference],
    };
    expect(
      prepareSavedAdSourceAllocationSchema.safeParse({
        ...input(),
        draft: valid,
      }).success,
    ).toBe(true);
    const invalidDrafts = [
      { ...draft, extra: true },
      { ...draft, intent: { ...draft.intent, extra: true } },
      { ...draft, output: { ...draft.output, extra: true } },
      { ...draft, target: { ...draft.target, extra: true } },
      { ...draft, identity: { extra: true } },
      { ...draft, identity: { avatarAssetId: 'avatar-A' } },
      {
        ...draft,
        identity: {
          avatarAssetId: 'avatar-A',
          speechVoiceId: 'voice-A',
          extra: true,
        },
      },
      { ...draft, references: [{ ...reference, extra: true }] },
      { ...draft, references: [{ ...reference, role: 'unknown' }] },
      { ...draft, references: [{ ...reference, assetId: 'invalid/id' }] },
      { ...draft, references: Array.from({ length: 21 }, () => reference) },
      { ...draft, fidelityMode: 'unknown' },
    ];
    for (const value of invalidDrafts)
      expect(
        prepareSavedAdSourceAllocationSchema.safeParse({
          ...input(),
          draft: value,
        }).success,
      ).toBe(false);
  });
  it('rejects context, authority and server identity injection into request data', () => {
    for (const field of [
      'organizationId',
      'actorUserId',
      'allocationId',
      'remixRunId',
      'runId',
      'receipt',
      'quote',
      'quoteId',
      'approval',
      'approvalId',
      'budget',
      'budgetGrant',
      'authorization',
      'sourceSnapshot',
      'allocationInputHash',
      'unexpected',
    ])
      expect(
        prepareSavedAdSourceAllocationSchema.safeParse({
          ...input(),
          [field]: 'injected',
        }).success,
      ).toBe(false);
    expect(
      agentSourceAllocationContextSchema.safeParse({
        ...context(),
        approval: true,
      }).success,
    ).toBe(false);
  });
  it('inherits only canonical references omission normalization', () => {
    const { references: _references, ...draft } = input().draft;
    const parsed = prepareSavedAdSourceAllocationSchema.parse({
      ...input(),
      draft,
    });
    expect(parsed.draft.references).toEqual([]);
    expect(parsed).toEqual(input());
  });
  it('requires a lowercase 64-hex digest, saved_ad kind and strict receipt fields', () => {
    for (const allocationInputHash of [
      '',
      'a'.repeat(63),
      'a'.repeat(65),
      'A'.repeat(64),
      'g'.repeat(64),
      `sha256:${'a'.repeat(64)}`,
    ])
      expect(
        agentSourceAllocationReceiptSchema.safeParse({
          ...receipt(),
          allocationInputHash,
        }).success,
      ).toBe(false);
    for (const sourceKind of ['source_post', 'saved_ads', undefined])
      expect(
        agentSourceAllocationReceiptSchema.safeParse({
          ...receipt(),
          sourceKind,
        }).success,
      ).toBe(false);
    expect(
      agentSourceAllocationReceiptSchema.safeParse({
        ...receipt(),
        approval: true,
      }).success,
    ).toBe(false);
  });
  it('keeps schema-inferred types and the narrowed draft compatible with canonical contracts', () => {
    expectTypeOf<AgentSourceAllocationContext>().toEqualTypeOf<
      z.infer<typeof agentSourceAllocationContextSchema>
    >();
    expectTypeOf<PrepareSavedAdSourceAllocation>().toEqualTypeOf<
      z.infer<typeof prepareSavedAdSourceAllocationSchema>
    >();
    expectTypeOf<AgentSourceAllocationReceipt>().toEqualTypeOf<
      z.infer<typeof agentSourceAllocationReceiptSchema>
    >();
    const parsed = prepareSavedAdSourceAllocationSchema.parse(input());
    const canonical: BrandRemixDraft = parsed.draft;
    expectTypeOf(parsed.draft.output.kind).toEqualTypeOf<'copy'>();
    expectTypeOf(parsed.draft.target.kind).toEqualTypeOf<'organic'>();
    expect(brandRemixDraftSchema.parse(canonical)).toEqual(parsed.draft);
  });
});
