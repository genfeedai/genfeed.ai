import {
  assertSourceCaptureAttemptMatch,
  createSourceCaptureIngest,
  importedSourceMediaId,
  importedSourceMediaUrlDigest,
  importedSourceStorageId,
  mergeImportedSourceMediaBinding,
  mergeSourceCaptureIngest,
  parseImportedSourceMediaBinding,
  parseSourceCaptureIngest,
  sourceCaptureLeaseExpired,
} from '@api/services/agent-source-ingest/agent-imported-source-ingest.state';
import type {
  AgentImportedSourceIngestInput,
  SourceCaptureIngest,
} from '@api/services/agent-source-ingest/agent-source-ingest.interface';
import type { ImportedSourceMediaBinding } from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import type { Prisma } from '@genfeedai/prisma';
import { expect, it } from 'vitest';

const scope = {
  organizationId: 'corg12345678',
  brandId: 'cbrand12345678',
  userId: 'cuser12345678',
};
const sourceId = 'csource12345678';
const sourceDigest = 'a'.repeat(64);
const mediaDigest = importedSourceMediaUrlDigest(
  'https://media.example/original.mp4',
);
const mediaId = importedSourceMediaId(
  scope,
  sourceId,
  sourceDigest,
  'video',
  mediaDigest,
);
const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const binding: ImportedSourceMediaBinding = {
  version: 1,
  sourceIdentityDigest: sourceDigest,
  sourceRecordVersion: 1,
  mediaIngredientId: mediaId,
  mediaKind: 'video',
  mediaUrlDigest: mediaDigest,
  bindingRevision: 1,
  selectedAt: '2026-01-01T00:00:00Z',
  selectedByUserId: scope.userId,
};
const ingest: SourceCaptureIngest = {
  version: 1,
  sourceId,
  sourceIdentityDigest: sourceDigest,
  mediaUrlDigest: mediaDigest,
  mediaKind: 'video',
  actorUserId: scope.userId,
  ingestRevision: 1,
  attemptId: requestId,
  requestId,
  storageId: importedSourceStorageId(mediaId, 1, requestId),
  startedAt: '2026-01-01T00:00:00Z',
  leaseUntil: '2026-01-01T00:50:00Z',
  state: 'claimed',
};
function stored(value: unknown): Prisma.JsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}
it('shares media identity across users while separating source, brand and selected kind', () => {
  expect(
    importedSourceMediaId(
      { ...scope, userId: 'cother12345678' },
      sourceId,
      sourceDigest,
      'video',
      mediaDigest,
    ),
  ).toBe(mediaId);
  for (const id of [
    importedSourceMediaId(
      scope,
      'cother12345678',
      sourceDigest,
      'video',
      mediaDigest,
    ),
    importedSourceMediaId(
      { ...scope, brandId: 'cother12345678' },
      sourceId,
      sourceDigest,
      'video',
      mediaDigest,
    ),
    importedSourceMediaId(scope, sourceId, sourceDigest, 'audio', mediaDigest),
  ])
    expect(id).not.toBe(mediaId);
  expect(mediaId).toMatch(/^c[0-9a-f]{64}$/);
});
it('fences storage identity by revision and attempt even when request UUID repeats', () => {
  expect(importedSourceStorageId(mediaId, 2, requestId)).not.toBe(
    ingest.storageId,
  );
  expect(
    importedSourceStorageId(mediaId, 1, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ).not.toBe(ingest.storageId);
});
it('merges only the named sibling and preserves immutable originals/unrelated state', () => {
  const original = stored({
    importedSource: { immutable: 'original' },
    unrelated: { value: 1 },
  });
  const merged = stored(mergeImportedSourceMediaBinding(original, binding));
  expect(merged).toMatchObject({
    importedSource: { immutable: 'original' },
    unrelated: { value: 1 },
  });
  expect(parseImportedSourceMediaBinding(merged)).toEqual(binding);
  expect(
    mergeSourceCaptureIngest(stored({ unrelated: 1 }), ingest),
  ).toMatchObject({ unrelated: 1, sourceCaptureIngest: ingest });
  expect(original).not.toHaveProperty('importedSourceMedia');
});
it('strictly rejects malformed or unknown existing state instead of silently overwriting', () => {
  expect(parseImportedSourceMediaBinding(null)).toBeUndefined();
  for (const value of [
    'broken',
    [],
    { importedSourceMedia: { ...binding, bindingRevision: 2 } },
    { importedSourceMedia: { ...binding, private: 'unrecognized' } },
  ])
    expect(() => parseImportedSourceMediaBinding(stored(value))).toThrow();
  for (const value of [
    null,
    {},
    { sourceCaptureIngest: { ...ingest, state: 'submitted' } },
    { sourceCaptureIngest: { ...ingest, leaseUntil: ingest.startedAt } },
    { sourceCaptureIngest: { ...ingest, permission: true } },
  ])
    expect(() => parseSourceCaptureIngest(stored(value))).toThrow();
});
it('uses the exact fifty minute lease boundary and validates submitted identity', () => {
  expect(
    sourceCaptureLeaseExpired(ingest, Date.parse(ingest.leaseUntil) - 1),
  ).toBe(false);
  expect(sourceCaptureLeaseExpired(ingest, Date.parse(ingest.leaseUntil))).toBe(
    true,
  );
  expect(
    parseSourceCaptureIngest(
      stored({
        sourceCaptureIngest: {
          ...ingest,
          state: 'submitted',
          jobId: `agent-source-${ingest.storageId}`,
        },
      }),
    ).state,
  ).toBe('submitted');
});

it('roundtrips opaque legacy actors unchanged and rejects blank actors', () => {
  const actor = ' LegacyUser7Qp2Rk9sX4N6b8 ';
  expect(
    parseImportedSourceMediaBinding(
      stored({ importedSourceMedia: { ...binding, selectedByUserId: actor } }),
    )?.selectedByUserId,
  ).toBe(actor);
  expect(
    parseSourceCaptureIngest(
      stored({ sourceCaptureIngest: { ...ingest, actorUserId: actor } }),
    ).actorUserId,
  ).toBe(actor);
  for (const actorUserId of ['', ' ', '\t']) {
    expect(() =>
      parseImportedSourceMediaBinding(
        stored({
          importedSourceMedia: { ...binding, selectedByUserId: actorUserId },
        }),
      ),
    ).toThrow();
    expect(() =>
      parseSourceCaptureIngest(
        stored({ sourceCaptureIngest: { ...ingest, actorUserId } }),
      ),
    ).toThrow();
  }
});

const captureInput: AgentImportedSourceIngestInput = {
  sourceId,
  sourceIdentityDigest: sourceDigest,
  sourceRecordVersion: 1,
  title: 'Original',
  requestId: requestId.toUpperCase(),
};
it('constructs a pure deterministic fifty-minute fresh attempt with exact canonical fields', () => {
  const fresh = createSourceCaptureIngest(
    captureInput,
    scope,
    binding,
    1,
    ingest.startedAt,
  );
  expect(fresh).toEqual({ ...ingest, leaseUntil: '2026-01-01T00:50:00.000Z' });
  expect(
    createSourceCaptureIngest(
      captureInput,
      scope,
      binding,
      1,
      ingest.startedAt,
    ),
  ).toEqual(fresh);
  expect(fresh).not.toHaveProperty('jobId');
  expect(fresh).not.toHaveProperty('errorCode');
  const retry = createSourceCaptureIngest(
    captureInput,
    { ...scope, userId: ' LegacyUser7Qp2Rk9sX4N6b8 ' },
    binding,
    2,
    ingest.startedAt,
    1,
  );
  expect(retry).toMatchObject({
    ingestRevision: 2,
    retryFromRevision: 1,
    actorUserId: ' LegacyUser7Qp2Rk9sX4N6b8 ',
    state: 'claimed',
  });
  expect(retry.storageId).not.toBe(fresh.storageId);
});
it('rejects internal constructor request/revision/material/scope/timestamp inconsistencies as conflicts', () => {
  for (const construct of [
    () =>
      createSourceCaptureIngest(
        { ...captureInput, requestId: 'bad' },
        scope,
        binding,
        1,
        ingest.startedAt,
      ),
    () =>
      createSourceCaptureIngest(
        { ...captureInput, sourceRecordVersion: 2 },
        scope,
        binding,
        1,
        ingest.startedAt,
      ),
    () =>
      createSourceCaptureIngest(
        { ...captureInput, sourceIdentityDigest: 'b'.repeat(64) },
        scope,
        binding,
        1,
        ingest.startedAt,
      ),
    () =>
      createSourceCaptureIngest(
        captureInput,
        { ...scope, userId: ' ' },
        binding,
        1,
        ingest.startedAt,
      ),
    () =>
      createSourceCaptureIngest(
        captureInput,
        { ...scope, brandId: 'invalid' },
        binding,
        1,
        ingest.startedAt,
      ),
    () =>
      createSourceCaptureIngest(
        captureInput,
        scope,
        { ...binding, mediaIngredientId: 'cother12345678' },
        1,
        ingest.startedAt,
      ),
    () =>
      createSourceCaptureIngest(
        captureInput,
        scope,
        binding,
        0,
        ingest.startedAt,
      ),
    () =>
      createSourceCaptureIngest(
        captureInput,
        scope,
        binding,
        2147483648,
        ingest.startedAt,
        2147483647,
      ),
    () =>
      createSourceCaptureIngest(
        captureInput,
        scope,
        binding,
        1,
        ingest.startedAt,
        1,
      ),
    () =>
      createSourceCaptureIngest(
        captureInput,
        scope,
        binding,
        2,
        ingest.startedAt,
      ),
    () =>
      createSourceCaptureIngest(
        captureInput,
        scope,
        binding,
        2,
        ingest.startedAt,
        2,
      ),
    () =>
      createSourceCaptureIngest(captureInput, scope, binding, 1, 'not-a-time'),
  ])
    expect(construct).toThrowError(expect.objectContaining({ status: 409 }));
});
it('compares every immutable attempt field while allowing same-attempt submitted/uncertain progress', () => {
  expect(() =>
    assertSourceCaptureAttemptMatch(
      {
        ...ingest,
        state: 'submitted',
        jobId: `agent-source-${ingest.storageId}`,
      },
      ingest,
    ),
  ).not.toThrow();
  expect(() =>
    assertSourceCaptureAttemptMatch(
      { ...ingest, state: 'uncertain', errorCode: 'SOURCE_MEDIA_UNCERTAIN' },
      ingest,
    ),
  ).not.toThrow();
  const changes: Array<Partial<SourceCaptureIngest>> = [
    { sourceId: 'cother12345678' },
    { sourceIdentityDigest: 'b'.repeat(64) },
    { mediaUrlDigest: 'b'.repeat(64) },
    { mediaKind: 'audio' },
    { actorUserId: 'different' },
    { ingestRevision: 2 },
    { attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    { requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    { retryFromRevision: 1 },
    { storageId: 'cother12345678' },
    { state: 'ready' },
    { state: 'failed' },
  ];
  for (const change of changes)
    expect(() =>
      assertSourceCaptureAttemptMatch({ ...ingest, ...change }, ingest),
    ).toThrow();
});
