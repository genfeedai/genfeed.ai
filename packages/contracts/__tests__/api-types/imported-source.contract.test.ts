import {
  importedSourceEnvelopeSchema,
  importedSourceListQuerySchema,
  importedSourceSnapshotInputSchema,
  recaptureImportedSourceSchema,
  saveImportedSourceSchema,
} from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import { expect, it } from 'vitest';

const snapshot = {
  kind: 'article',
  canonicalUrl:
    'https://example.com/article?a=2&token=secret&utm_source=x&b=1#part',
  title: ' Article ',
  capturedText: '  Original <b>text</b>\n ',
  contentBasis: 'visible_selection',
};
it('sanitizes URL secrets/fragment while retaining full path and sorted nonsecret identity', () => {
  const parsed = importedSourceSnapshotInputSchema.parse(snapshot);
  expect(parsed.canonicalUrl).toBe('https://example.com/article?a=2&b=1');
  expect(parsed.title).toBe('Article');
  expect(parsed.capturedText).toBe(snapshot.capturedText);
});
it.each([
  'ftp://example.com/file',
  'https://user:password@example.com/file',
  'not-a-url',
  'javascript:alert(1)',
])('rejects unsafe primitive URL %s', (canonicalUrl) => {
  expect(
    importedSourceSnapshotInputSchema.safeParse({ ...snapshot, canonicalUrl })
      .success,
  ).toBe(false);
});
it('removes every frozen sensitive query category without truncating path or unrelated query', () => {
  const canonicalUrl =
    'https://example.com/authenticated/path?session=x&credential=x&cookie=x&signature=x&api_key=x&code=x&key=x&state=x&passwd=x&auth=x&secret=x&password=x&z=2&a=1';
  expect(
    importedSourceSnapshotInputSchema.parse({ ...snapshot, canonicalUrl })
      .canonicalUrl,
  ).toBe('https://example.com/authenticated/path?a=1&z=2');
});
it.each([
  'organizationId',
  'userId',
  'brandId',
  'provenance',
  'generation',
  'permission',
  'version',
])('rejects client field %s without stripping it', (field) => {
  expect(
    saveImportedSourceSchema.safeParse({
      snapshot: { ...snapshot, [field]: 'injected' },
    }).success,
  ).toBe(false);
  expect(
    saveImportedSourceSchema.safeParse({ snapshot, [field]: 'injected' })
      .success,
  ).toBe(false);
});
it('bounds primitive text and Unicode bytes; retains whitespace and HTML as untrusted plain data', () => {
  expect(
    importedSourceSnapshotInputSchema.safeParse({
      ...snapshot,
      capturedText: 123,
    }).success,
  ).toBe(false);
  expect(
    importedSourceSnapshotInputSchema.safeParse({
      ...snapshot,
      capturedText: 'x'.repeat(100001),
    }).success,
  ).toBe(false);
  expect(
    importedSourceSnapshotInputSchema.safeParse({
      ...snapshot,
      capturedText: '😀'.repeat(50000),
    }).success,
  ).toBe(true);
  expect(
    importedSourceSnapshotInputSchema.safeParse({
      ...snapshot,
      title: 'x'.repeat(1001),
    }).success,
  ).toBe(false);
});
it('distinguishes metadata from visible text/transcript and preserves selected-media limitations', () => {
  expect(
    importedSourceSnapshotInputSchema.safeParse({
      ...snapshot,
      contentBasis: 'metadata_only',
    }).success,
  ).toBe(false);
  expect(
    importedSourceSnapshotInputSchema.safeParse({
      ...snapshot,
      capturedText: '   ',
    }).success,
  ).toBe(false);
  const parsed = importedSourceSnapshotInputSchema.parse({
    ...snapshot,
    kind: 'podcast',
    contentBasis: 'metadata_only',
    capturedText: '',
    selectedMedia: {
      kind: 'audio',
      url: 'https://example.com/embed?token=x&id=1',
      availability: 'embed_only',
    },
    clientCapturedAt: '2099-01-01T00:00:00+02:00',
  });
  expect(parsed.selectedMedia).toEqual({
    kind: 'audio',
    url: 'https://example.com/embed?id=1',
    availability: 'embed_only',
  });
  expect(
    importedSourceSnapshotInputSchema.safeParse({
      ...parsed,
      selectedMedia: { ...parsed.selectedMedia, permission: true },
    }).success,
  ).toBe(false);
});
it('accepts full c+64hex entity identity and normalizes only UUIDv4 recapture keys', () => {
  expect(isEntityId(`c${'a'.repeat(64)}`)).toBe(true);
  expect(
    recaptureImportedSourceSchema.parse({
      requestId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    }),
  ).toEqual({ requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  expect(
    recaptureImportedSourceSchema.safeParse({
      requestId: 'aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa',
    }).success,
  ).toBe(false);
  expect(
    recaptureImportedSourceSchema.safeParse({
      requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      snapshot,
    }).success,
  ).toBe(false);
});
it('validates strict numeric pagination and paired successor metadata', () => {
  expect(importedSourceListQuerySchema.parse({})).toEqual({
    page: 1,
    limit: 20,
  });
  for (const query of [
    { page: '1' },
    { limit: 101 },
    { page: 10001 },
    { isDeleted: true },
  ])
    expect(importedSourceListQuerySchema.safeParse(query).success).toBe(false);
  expect(importedSourceEnvelopeSchema.safeParse({ version: 1 }).success).toBe(
    false,
  );
});
