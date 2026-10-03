import type { ImportedSourceRecord } from '@api/collections/imported-sources/services/imported-source-state';
import {
  importedSourceIdentityDigest,
  importedSourceRecaptureId,
  importedSourceRootId,
  normalizeImportedSourceInput,
  projectImportedSource,
  readImportedSourceEnvelope,
} from '@api/collections/imported-sources/services/imported-source-state';
import type { Prisma } from '@genfeedai/prisma';
import { expect, it } from 'vitest';

const scope = { organizationId: 'corganization123', brandId: 'cbrand1234567' };
const input = {
  snapshot: {
    kind: 'page',
    canonicalUrl: 'https://example.com/path?b=2&a=1&token=x',
    title: 'Page',
    capturedText: ' exact excerpt ',
    contentBasis: 'visible_page',
    clientCapturedAt: '2020-01-01T00:00:00Z',
  },
};
function storedJson(value: unknown): Prisma.JsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}
function record(): ImportedSourceRecord {
  const snapshot = normalizeImportedSourceInput(input);
  const digest = importedSourceIdentityDigest(scope, snapshot);
  const id = importedSourceRootId(digest);
  return {
    id,
    ...scope,
    version: 1,
    sourceActionId: `imported-source:v1:${digest}`,
    isDeleted: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    providerData: storedJson({
      importedSource: {
        version: 1,
        identityDigest: digest,
        originIngredientId: id,
        captureRevision: 1,
        snapshot: {
          ...snapshot,
          capturedAt: '2026-01-01T00:00:00.000Z',
          captureSurface: 'extension',
          provenance: 'imported',
          evidenceAuthority: 'client_reported',
          host: 'example.com',
        },
      },
    }),
  };
}
it('digest excludes capture time but includes material and tenant/brand identity', () => {
  const snapshot = normalizeImportedSourceInput(input);
  const digest = importedSourceIdentityDigest(scope, snapshot);
  expect(
    importedSourceIdentityDigest(scope, {
      ...snapshot,
      clientCapturedAt: '2026-01-01T00:00:00Z',
    }),
  ).toBe(digest);
  for (const changed of [
    { ...snapshot, capturedText: 'different' },
    { ...snapshot, title: 'different' },
    { ...snapshot, canonicalUrl: 'https://example.com/other' },
  ])
    expect(importedSourceIdentityDigest(scope, changed)).not.toBe(digest);
  expect(
    importedSourceIdentityDigest(
      { ...scope, brandId: 'cotherbrand123' },
      snapshot,
    ),
  ).not.toBe(digest);
  expect(importedSourceRootId(digest)).toMatch(/^c[0-9a-f]{64}$/);
  expect(
    importedSourceRecaptureId(
      scope,
      `c${digest}`,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ),
  ).not.toBe(importedSourceRootId(digest));
});
it('projects only immutable public source values without internal JSON or caller identity', () => {
  const row = record();
  expect(projectImportedSource(row)).toMatchObject({
    id: row.id,
    brandId: scope.brandId,
    recordVersion: 1,
    deduplicated: false,
    snapshot: {
      capturedText: ' exact excerpt ',
      evidenceAuthority: 'client_reported',
    },
  });
  expect(projectImportedSource(row)).not.toHaveProperty('providerData');
  expect(projectImportedSource(row)).not.toHaveProperty('sourceActionId');
});
it.each(['version', 'sourceActionId', 'id', 'providerData'])(
  'rejects corrupted %s rather than repair',
  (field) => {
    const row = record();
    const corrupted = { ...row, [field]: field === 'version' ? 2 : 'bad' };
    expect(() =>
      readImportedSourceEnvelope(corrupted as ImportedSourceRecord),
    ).toThrow();
  },
);
it('rejects changed snapshot material or malformed stored URL with stable errors', () => {
  const row = record();
  const envelope = readImportedSourceEnvelope(row);
  for (const canonicalUrl of [
    'invalid',
    'https://example.com/path?token=secret',
    'https://example.com/changed',
  ]) {
    row.providerData = storedJson({
      importedSource: {
        ...envelope,
        snapshot: { ...envelope.snapshot, canonicalUrl },
      },
    });
    expect(() => readImportedSourceEnvelope(row)).toThrow(
      'Imported source state cannot be reused.',
    );
  }
  try {
    normalizeImportedSourceInput({
      snapshot: { ...input.snapshot, canonicalUrl: 'private-invalid-url' },
    });
  } catch (error) {
    expect(JSON.stringify(error)).not.toContain('private-invalid-url');
  }
});
