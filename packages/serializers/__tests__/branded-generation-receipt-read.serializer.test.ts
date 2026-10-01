import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function receipt(): BrandedGenerationReceiptV1 {
  return {
    schemaVersion: 1,
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'PRIVATE_ACTOR',
    requestKey: 'PRIVATE_REQUEST',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'created',
    mode: 'raw',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: null,
    resolutionHash: null,
    layers: [],
    learning: null,
    prompts: {
      original: { contentHash: hash, retention: 'pending' },
      enhanced: null,
      compiled: null,
    },
    execution: null,
    artifact: null,
    validation: null,
    compliance: 'not_claimed',
    diagnostics: [],
    costs: [{ id: 'cost', stage: 'generation', status: 'pending' }],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 0,
    },
    isDeleted: false,
  };
}

import {
  brandedGenerationPromptInspectionV1Schema,
  brandedGenerationReceiptReadV1Schema,
  brandedGenerationReceiptRevisionReadV1Schema,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-receipt-read.contract';
import {
  deserializeCollection,
  deserializeResource,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import { BrandedGenerationPromptInspectionSerializer } from '@serializers/server/content/branded-generation-prompt-inspection.serializer';
import { BrandedGenerationReceiptSerializer } from '@serializers/server/content/branded-generation-receipt.serializer';
import { BrandedGenerationReceiptRevisionSerializer } from '@serializers/server/content/branded-generation-receipt-revision.serializer';
import { describe, expect, it } from 'vitest';

describe('public read serializer round trips', () => {
  it('redacts actor/request after validating full internal cross-field invariants', () => {
    const value = receipt();
    const result = BrandedGenerationReceiptSerializer.serialize(value);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    expect(
      brandedGenerationReceiptReadV1Schema.parse(deserializeResource(result)),
    ).toMatchObject({ platform: null, generationId: null, id: value.id });
    expect(() =>
      BrandedGenerationReceiptRevisionSerializer.serialize({
        ...value,
        state: 'ready',
      }),
    ).toThrow();
  });
  it('serializes history using distinct compound IDs without altering input', () => {
    const values = [receipt(), { ...receipt(), revision: 1 }];
    const before = structuredClone(values);
    const result = BrandedGenerationReceiptRevisionSerializer.serialize(values);
    const items = deserializeCollection<unknown>(result).map((v) =>
      brandedGenerationReceiptRevisionReadV1Schema.parse(v),
    );
    expect(items.map((v) => v.id)).toEqual(['receipt:0', 'receipt:1']);
    expect(items.map((v) => v.receiptId)).toEqual(['receipt', 'receipt']);
    expect(values).toEqual(before);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  });
  it.each(['retained', 'unavailable'] as const)(
    'emits explicit nulls for %s without entity fields',
    (status) => {
      const result =
        status === 'retained'
          ? { status, text: '  Cafe\u0301 🎨\r\n', contentHash: hash }
          : { status, reasonCode: 'prompt_payload_purged' };
      const serialized = BrandedGenerationPromptInspectionSerializer.serialize({
        receiptId: 'receipt',
        receiptRevision: 3,
        stage: 'compiled',
        result,
      });
      const value = brandedGenerationPromptInspectionV1Schema.parse(
        deserializeResource(serialized),
      );
      expect(value).toMatchObject({ id: 'receipt:3:compiled', status });
      expect(value).not.toHaveProperty('createdAt');
      expect(value).not.toHaveProperty('isDeleted');
      if (value.status === 'retained') {
        expect(value.text).toBe('  Cafe\u0301 🎨\r\n');
        expect(value.reasonCode).toBeNull();
      } else {
        expect(value.text).toBeNull();
        expect(value.contentHash).toBeNull();
      }
    },
  );
  it('preserves null/array semantics and throws malformed source errors', () => {
    expect(
      BrandedGenerationPromptInspectionSerializer.serialize(null).data,
    ).toBeNull();
    expect(() =>
      BrandedGenerationPromptInspectionSerializer.serialize({
        receiptId: 'receipt',
        receiptRevision: 0,
        stage: 'compiled',
        result: { status: 'retained', text: 'x', contentHash: 'bad' },
      }),
    ).toThrow();
  });
});
