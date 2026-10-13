import {
  hashBrandedGenerationRequestV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { assertBrandedGenerationResolutionV1 } from '@api/services/branded-generation-receipts/branded-generation-projection.util';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

const actor = { actorId: 'user', brandId: 'brand', organizationId: 'org' };

const input: BrandedGenerationInputV1 = {
  actorId: 'user',
  brandId: 'brand',
  candidateIndex: 0,
  contentType: 'post',
  draftRevisionId: 'draft-1',
  format: 'text',
  generationParameters: {},
  knowledgeSourceIds: [],
  knowledgeSpaceIds: [],
  mode: 'provisional_brand',
  model: 'openai/gpt-4o-mini',
  organizationId: 'org',
  originalPrompt: 'Write a post',
  provider: 'openrouter',
  requestKey: 'request-1',
  schemaVersion: 1,
  surface: 'onboarding',
};

const current = {
  actorId: 'user',
  brandId: 'brand',
  candidateIndex: 0,
  mode: 'provisional_brand',
  organizationId: 'org',
  prompts: {
    original: {
      contentHash: hashBrandedGenerationTextV1(input.originalPrompt),
    },
  },
  requestHash: hashBrandedGenerationRequestV1(input),
  requestKey: 'request-1',
} as unknown as BrandedGenerationReceiptV1;

function resolution(
  snapshot: Record<string, unknown> | null,
): BrandedGenerationResolutionV1 {
  return {
    mode: 'provisional_brand',
    snapshot: snapshot && {
      brandId: 'brand',
      organizationId: 'org',
      ...snapshot,
    },
    status: 'blocked',
  } as unknown as BrandedGenerationResolutionV1;
}

describe('provisional resolution assertion', () => {
  it('accepts a provisional snapshot bound to the named draft', () => {
    expect(() =>
      assertBrandedGenerationResolutionV1(
        actor,
        current,
        resolution({ approval: 'provisional', revisionId: 'draft-1' }),
        input,
      ),
    ).not.toThrow();
  });

  it('rejects a snapshot of a different revision than the named draft', () => {
    expect(() =>
      assertBrandedGenerationResolutionV1(
        actor,
        current,
        resolution({ approval: 'provisional', revisionId: 'other-revision' }),
        input,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an approved snapshot under provisional mode', () => {
    expect(() =>
      assertBrandedGenerationResolutionV1(
        actor,
        current,
        resolution({ approval: 'approved', revisionId: 'draft-1' }),
        input,
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts a blocked resolution that carries no snapshot', () => {
    expect(() =>
      assertBrandedGenerationResolutionV1(
        actor,
        current,
        resolution(null),
        input,
      ),
    ).not.toThrow();
  });
});
