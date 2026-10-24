import {
  matchOrphanVariant,
  readDispatchSuccesses,
  readVariantCredits,
  requiredNumber,
  requiredRecord,
  requiredString,
  runtimeOf,
} from '@api/collections/content-runs/services/brand-remix-run-execution.helpers';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import type { BrandRemixExecution } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

function workflowRequest(runtimeContext: unknown): SystemWorkflowActionRequest {
  return {
    context: {
      organizationId: 'org-fixture',
      runId: 'run-fixture',
      userId: 'user-fixture',
      workflowId: 'workflow-fixture',
      workflowVersionId: 'version-fixture',
    },
    input: {},
    provenance: {
      executionId: 'execution-fixture',
      workflowId: 'workflow-fixture',
      workflowLabel: 'Synthetic remix',
    },
    runtimeContext,
  };
}

const malformedBatches = [
  undefined,
  null,
  [],
  42,
  'batch',
  {},
  { results: null },
  { results: {} },
];

const variants: BrandRemixExecution['variants'] = [
  { assetIds: [], id: 'first', recipeRevision: 3, status: 'queued' },
  {
    assetIds: ['saved-asset'],
    id: 'linked',
    recipeRevision: 3,
    status: 'processing',
  },
  { assetIds: [], id: 'last', recipeRevision: 3, status: 'processing' },
];

describe('remix workflow input adapters', () => {
  it.each([undefined, null, [], true, 12, 'record'])(
    'rejects a non-record input %j with the existing conflict',
    (value) => {
      expect(() => requiredRecord(value)).toThrow(ConflictException);
      expect(() => requiredRecord(value)).toThrow(
        'Brand remix workflow requires an object.',
      );
    },
  );

  it('preserves record identity and string/finite-number input semantics', () => {
    const record = { organizationId: ' org-fixture ', expectedRevision: 0 };
    expect(requiredRecord(record)).toBe(record);
    expect(requiredString(record.organizationId, 'organizationId')).toBe(
      'org-fixture',
    );
    expect(record.organizationId).toBe(' org-fixture ');
    expect(requiredNumber(0, 'expectedRevision')).toBe(0);
    expect(requiredNumber(-1.5, 'expectedRevision')).toBe(-1.5);
  });

  it.each([undefined, null, '', '  ', 3, false])(
    'rejects an absent string %j',
    (value) => {
      expect(() => requiredString(value, 'runId')).toThrow(
        'Brand remix workflow requires runId.',
      );
    },
  );

  it.each([undefined, null, '1', true, NaN, Infinity, -Infinity])(
    'rejects a non-finite or non-numeric revision %j',
    (value) => {
      expect(() => requiredNumber(value, 'expectedRevision')).toThrow(
        'Brand remix workflow requires numeric expectedRevision.',
      );
    },
  );

  it.each([
    undefined,
    null,
    {},
    { request: {} },
    { user: {} },
    { request: null, user: {} },
    { request: {}, user: null },
  ])('holds missing originating context %j before execution', (runtime) => {
    expect(() => runtimeOf(workflowRequest(runtime))).toThrow(
      ConflictException,
    );
    expect(() => runtimeOf(workflowRequest(runtime))).toThrow(
      'Brand remix generation requires the originating request context.',
    );
  });

  it('retains the originating request, user and shared seen-copy set by identity', () => {
    const runtime = {
      request: { trace: 'synthetic-request' },
      seenCopy: new Set(['already-generated']),
      user: {
        brandId: 'brand-fixture',
        id: 'user-fixture',
        organizationId: 'org-fixture',
        userId: 'user-fixture',
      },
    };
    const actual = runtimeOf(workflowRequest(runtime));
    expect(actual).toBe(runtime);
    expect(actual.seenCopy).toBe(runtime.seenCopy);
    expect([...actual.seenCopy]).toEqual(['already-generated']);
  });
});

describe('remix workflow batch results', () => {
  it.each(malformedBatches)('ignores malformed batch envelopes %j', (value) => {
    expect(readDispatchSuccesses(value)).toEqual([]);
    expect(readVariantCredits(value)).toEqual([]);
  });

  it('keeps only explicit dispatch successes in order, including duplicate IDs', () => {
    const batch = {
      results: [
        null,
        [],
        { result: null },
        { result: [] },
        { result: { success: false, variantId: 'failed' } },
        { result: { success: 'true', variantId: 'coerced' } },
        { result: { success: true, variantId: 4 } },
        { result: { success: true, variantId: 'first' } },
        { result: { success: true, variantId: 'first' } },
        { result: { success: true, variantId: '' } },
        { result: { success: true, variantId: 'last' } },
      ],
    };
    expect(readDispatchSuccesses(batch)).toEqual([
      'first',
      'first',
      '',
      'last',
    ]);
    expect(batch.results).toHaveLength(11);
  });

  it('preserves credit defaults and strict BYOK flags without coercion or deduplication', () => {
    const batch = {
      results: [
        null,
        [],
        { result: null },
        { result: [] },
        { result: { variantId: 12, amount: 99 } },
        { result: { variantId: 'paid', amount: 4, isByokBypass: false } },
        { result: { variantId: 'byok', amount: 8, isByokBypass: true } },
        { result: { variantId: 'default', amount: '4', isByokBypass: 'true' } },
        { result: { variantId: 'paid', amount: -1, isByokBypass: 1 } },
      ],
    };
    expect(readVariantCredits(batch)).toEqual([
      { amount: 4, isByokBypass: false, variantId: 'paid' },
      { amount: 8, isByokBypass: true, variantId: 'byok' },
      { amount: 0, isByokBypass: false, variantId: 'default' },
      { amount: -1, isByokBypass: false, variantId: 'paid' },
    ]);
  });

  it('leaves numeric credit validation at its existing boundary', () => {
    expect(
      readVariantCredits({
        results: [
          { result: { variantId: 'nan', amount: NaN } },
          { result: { variantId: 'infinite', amount: Infinity } },
        ],
      }),
    ).toEqual([
      { amount: NaN, isByokBypass: false, variantId: 'nan' },
      { amount: Infinity, isByokBypass: false, variantId: 'infinite' },
    ]);
  });
});

describe('remix orphan matching', () => {
  it('adopts an eligible indexed variant without mutating its eligibility sets', () => {
    const resumable = new Set(['first', 'last']);
    const adopted = new Set<string>();
    expect(
      matchOrphanVariant(
        { groupIndex: 2, id: 'orphan' },
        variants,
        resumable,
        adopted,
      ),
    ).toBe(variants[2]);
    expect([...resumable]).toEqual(['first', 'last']);
    expect(adopted.size).toBe(0);
    expect(variants[2].assetIds).toEqual([]);
  });

  it.each([-1, 1, 3])(
    'never reassigns an ineligible explicit index %i',
    (groupIndex) => {
      expect(
        matchOrphanVariant(
          { groupIndex, id: 'orphan' },
          variants,
          new Set(['first', 'linked', 'last']),
          new Set(),
        ),
      ).toBeUndefined();
    },
  );

  it('rejects an indexed variant that is non-resumable or already adopted', () => {
    expect(
      matchOrphanVariant(
        { groupIndex: 0, id: 'orphan' },
        variants,
        new Set(['last']),
        new Set(),
      ),
    ).toBeUndefined();
    expect(
      matchOrphanVariant(
        { groupIndex: 0, id: 'orphan' },
        variants,
        new Set(['first', 'last']),
        new Set(['first']),
      ),
    ).toBeUndefined();
  });

  it('matches an unindexed orphan to the first eligible unlinked, unadopted variant', () => {
    expect(
      matchOrphanVariant(
        { groupIndex: null, id: 'orphan' },
        variants,
        new Set(['first', 'linked', 'last']),
        new Set(),
      ),
    ).toBe(variants[0]);
    expect(
      matchOrphanVariant(
        { groupIndex: null, id: 'orphan' },
        variants,
        new Set(['first', 'linked', 'last']),
        new Set(['first']),
      ),
    ).toBe(variants[2]);
    expect(
      matchOrphanVariant(
        { groupIndex: null, id: 'orphan' },
        variants,
        new Set(['linked']),
        new Set(),
      ),
    ).toBeUndefined();
  });
});
