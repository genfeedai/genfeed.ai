import { ImportedSourceSerializer } from '@serializers/server/content/imported-source.serializer';
import { expect, it } from 'vitest';

it('projects exact JSONAPI view attributes and excludes extra private persistence fields', () => {
  const row = {
    id: 'csource12345',
    brandId: 'cbrand12345',
    recordVersion: 2,
    identityDigest: 'a'.repeat(64),
    snapshot: {
      capturedText: '<script>untrusted text</script>',
      provenance: 'imported',
    },
    deduplicated: true,
    recapturedFromIngredientId: 'cparent12345',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    providerData: { hidden: 'private' },
    sourceActionId: 'internal',
    organizationId: 'private',
    userId: 'private',
    recaptureRequestId: 'private',
    isDeleted: false,
    lockKey: 'private',
  };
  const serialized = ImportedSourceSerializer.serialize(row);
  expect(serialized).toMatchObject({
    data: {
      id: row.id,
      type: 'imported-source',
      attributes: {
        brandId: row.brandId,
        recordVersion: 2,
        identityDigest: row.identityDigest,
        snapshot: row.snapshot,
        deduplicated: true,
        recapturedFromIngredientId: row.recapturedFromIngredientId,
      },
    },
  });
  const json = JSON.stringify(serialized);
  for (const field of [
    'providerData',
    'sourceActionId',
    'organizationId',
    'userId',
    'recaptureRequestId',
    'isDeleted',
    'lockKey',
  ])
    expect(json).not.toContain(`"${field}"`);
  expect(json).toContain('<script>untrusted text</script>'); // Data only; consumers escape text rather than execute it.
});
