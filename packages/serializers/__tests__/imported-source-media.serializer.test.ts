import { ImportedSourceMediaSerializer } from '@serializers/server/content/imported-source-media.serializer';
import { expect, it } from 'vitest';

it('returns exact source media projection without download, job or request authority', () => {
  const row = {
    id: 'csource12345678',
    sourceId: 'csource12345678',
    sourceRecordVersion: 1,
    sourceIdentityDigest: 'a'.repeat(64),
    bindingRevision: 1,
    state: 'ready',
    ingredientId: 'cmedia12345678',
    ingestRevision: 2,
    mediaKind: 'video',
    canRetry: false,
    artifact: {
      organizationId: 'corg12345678',
      brandId: 'cbrand12345678',
      kind: 'ingredient',
      recordId: 'cmedia12345678',
      recordVersion: '2',
      serializer: 'ingredient',
    },
    signedUrl: 'private',
    s3Key: 'private',
    storageId: 'private',
    jobId: 'private',
    requestId: 'private',
    userId: 'private',
    providerData: {},
    isDeleted: false,
  };
  const result = ImportedSourceMediaSerializer.serialize(row);
  expect(result).toMatchObject({
    data: {
      id: row.sourceId,
      type: 'imported-source-media',
      attributes: {
        sourceId: row.sourceId,
        sourceRecordVersion: 1,
        state: 'ready',
        ingestRevision: 2,
        ingredientId: row.ingredientId,
        artifact: row.artifact,
        canRetry: false,
      },
    },
  });
  const text = JSON.stringify(result);
  for (const field of [
    'signedUrl',
    's3Key',
    'storageId',
    'jobId',
    'requestId',
    'userId',
    'providerData',
    'isDeleted',
  ])
    expect(text).not.toContain(`"${field}"`);
});
