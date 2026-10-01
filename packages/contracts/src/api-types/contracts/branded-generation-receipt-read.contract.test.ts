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
function publicReceipt() {
  const { actorId: _actor, requestKey: _key, ...value } = receipt();
  return {
    ...value,
    platform: null,
    parentRequestId: null,
    runId: null,
    workflowExecutionId: null,
    generationId: null,
  };
}

import {
  brandedGenerationPromptInspectionSourceV1Schema,
  brandedGenerationPromptInspectionV1Schema,
  brandedGenerationReceiptReadV1Schema,
  brandedGenerationReceiptRevisionReadV1Schema,
} from '@genfeedai/contracts/api-types/contracts/branded-generation-receipt-read.contract';
import { describe, expect, it } from 'vitest';

describe('historical public receipt reads', () => {
  it('accepts actual nullable serialization and rejects private/unknown fields', () => {
    const value = publicReceipt();
    expect(brandedGenerationReceiptReadV1Schema.parse(value)).toEqual(value);
    for (const field of ['actorId', 'requestKey', 'compilerRecipe'])
      expect(() =>
        brandedGenerationReceiptReadV1Schema.parse({
          ...value,
          [field]: 'private',
        }),
      ).toThrow();
  });
  it('uses unique compound resource identities and validates the decimal revision', () => {
    const value = {
      ...publicReceipt(),
      receiptId: 'receipt',
      id: 'receipt:7',
      revision: 7,
    };
    expect(brandedGenerationReceiptRevisionReadV1Schema.parse(value)).toEqual(
      value,
    );
    for (const id of ['receipt', 'receipt:07', 'other:7'])
      expect(() =>
        brandedGenerationReceiptRevisionReadV1Schema.parse({ ...value, id }),
      ).toThrow();
  });
  it('enforces UTF8 prompt bounds and exact explicit null branches', () => {
    const value = {
      id: 'receipt:0:original',
      receiptId: 'receipt',
      receiptRevision: 0,
      stage: 'original',
      status: 'retained',
      text: '  Cafe\u0301 🎨\r\n',
      contentHash: hash,
      reasonCode: null,
    };
    expect(brandedGenerationPromptInspectionV1Schema.parse(value)).toEqual(
      value,
    );
    expect(() =>
      brandedGenerationPromptInspectionV1Schema.parse({
        ...value,
        text: '🎨'.repeat(16385),
      }),
    ).toThrow();
    expect(() =>
      brandedGenerationPromptInspectionV1Schema.parse({
        ...value,
        id: 'receipt:1:original',
      }),
    ).toThrow();
    expect(() =>
      brandedGenerationPromptInspectionV1Schema.parse({
        ...value,
        receiptRevision: 2147483648,
      }),
    ).toThrow();
    expect(() =>
      brandedGenerationPromptInspectionV1Schema.parse({
        ...value,
        reasonCode: undefined,
      }),
    ).toThrow();
    for (const reasonCode of [
      'prompt_snapshot_unavailable',
      'prompt_payload_purged',
      'prompt_integrity_failed',
    ])
      expect(
        brandedGenerationPromptInspectionV1Schema.parse({
          ...value,
          status: 'unavailable',
          text: null,
          contentHash: null,
          reasonCode,
        }),
      ).toMatchObject({ reasonCode });
  });
  it('keeps the serializer source union separate from public transport', () => {
    const source = {
      receiptId: 'receipt',
      receiptRevision: 0,
      stage: 'original',
      result: { status: 'retained', text: 'exact', contentHash: hash },
    };
    expect(
      brandedGenerationPromptInspectionSourceV1Schema.parse(source),
    ).toEqual(source);
    expect(() =>
      brandedGenerationPromptInspectionSourceV1Schema.parse({
        ...source,
        result: { ...source.result, reasonCode: null },
      }),
    ).toThrow();
  });
});
