import {
  importedSourceMediaBindingSchema,
  importedSourceMediaRetrySchema,
  importedSourceMediaStartSchema,
  importedSourceMediaViewSchema,
} from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import { describe, expect, it } from 'vitest';

const requestId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const binding = {
  version: 1,
  sourceIdentityDigest: 'a'.repeat(64),
  sourceRecordVersion: 1,
  mediaIngredientId: 'cmedia12345678',
  mediaKind: 'video',
  mediaUrlDigest: 'b'.repeat(64),
  bindingRevision: 1,
  selectedAt: '2026-01-01T00:00:00Z',
  selectedByUserId: 'cuser12345678',
};
const view = {
  id: 'csource12345678',
  sourceId: 'csource12345678',
  sourceRecordVersion: 1,
  sourceIdentityDigest: 'a'.repeat(64),
  bindingRevision: 0,
  state: 'not_requested',
  canRetry: false,
};
describe('imported source media contracts', () => {
  it('requires explicit UUID4 requests and canonicalizes case', () => {
    expect(importedSourceMediaStartSchema.parse({ requestId }).requestId).toBe(
      requestId.toLowerCase(),
    );
    for (const value of ['', 'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa'])
      expect(
        importedSourceMediaStartSchema.safeParse({ requestId: value }).success,
      ).toBe(false);
  });
  it.each([
    'url',
    'organizationId',
    'brandId',
    'ingredientId',
    'permission',
    'generation',
  ])('rejects caller authority %s', (field) => {
    expect(
      importedSourceMediaStartSchema.safeParse({
        requestId,
        [field]: 'untrusted',
      }).success,
    ).toBe(false);
  });
  it('requires a primitive positive retry revision and rejects unknown fields', () => {
    expect(
      importedSourceMediaRetrySchema.parse({
        requestId,
        expectedIngestRevision: 2,
      }).expectedIngestRevision,
    ).toBe(2);
    for (const value of [0, -1, 1.5, '2', Infinity])
      expect(
        importedSourceMediaRetrySchema.safeParse({
          requestId,
          expectedIngestRevision: value,
        }).success,
      ).toBe(false);
    expect(
      importedSourceMediaRetrySchema.safeParse({
        requestId,
        expectedIngestRevision: 1,
        sourceId: 'csource12345678',
      }).success,
    ).toBe(false);
  });
  it('has an immutable binding with bounded identity fields', () => {
    expect(importedSourceMediaBindingSchema.safeParse(binding).success).toBe(
      true,
    );
    for (const patch of [
      { bindingRevision: 2 },
      { mediaUrlDigest: 'bad' },
      { rawUrl: 'https://secret.example' },
      { selectedByUserId: ' ' },
    ])
      expect(
        importedSourceMediaBindingSchema.safeParse({ ...binding, ...patch })
          .success,
      ).toBe(false);
  });
  it('permits authorized artifacts only in ready projections and no private fields', () => {
    expect(importedSourceMediaViewSchema.safeParse(view).success).toBe(true);
    const ready = {
      ...view,
      bindingRevision: 1,
      state: 'ready',
      ingredientId: binding.mediaIngredientId,
      ingestRevision: 1,
      artifact: {
        organizationId: 'corg12345678',
        brandId: 'cbrand12345678',
        kind: 'ingredient',
        recordId: binding.mediaIngredientId,
        recordVersion: '1',
        serializer: 'ingredient',
      },
    };
    expect(importedSourceMediaViewSchema.safeParse(ready).success).toBe(true);
    expect(
      importedSourceMediaViewSchema.safeParse({ ...ready, state: 'processing' })
        .success,
    ).toBe(false);
    expect(
      importedSourceMediaViewSchema.safeParse({ ...view, jobId: 'private' })
        .success,
    ).toBe(false);
    expect(
      importedSourceMediaViewSchema.safeParse({ ...view, state: 'ready' })
        .success,
    ).toBe(false);
  });
});
