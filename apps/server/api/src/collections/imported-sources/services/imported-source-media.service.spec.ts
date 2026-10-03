import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ImportedSourceMediaService } from '@api/collections/imported-sources/services/imported-source-media.service';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AgentImportedSourceIngestService } from '@api/services/agent-source-ingest/agent-imported-source-ingest.service';
import type { ImportedSourceView } from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, expect, it, vi } from 'vitest';

const user: AuthenticatedUser = {
  id: 'legacy-provider-subject',
  userId: 'LegacyUser7Qp2Rk9sX4N6b8',
  organizationId: 'corg12345678',
  brandId: 'cbrand12345678',
};
const source: ImportedSourceView = {
  id: 'csource12345678',
  brandId: 'cbrand12345678',
  recordVersion: 1,
  identityDigest: 'a'.repeat(64),
  deduplicated: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  snapshot: {
    kind: 'video',
    canonicalUrl: 'https://example.com/source',
    title: 'Original',
    capturedText: 'original',
    contentBasis: 'visible_page',
    capturedAt: '2026-01-01T00:00:00Z',
    captureSurface: 'extension',
    provenance: 'imported',
    evidenceAuthority: 'client_reported',
    host: 'example.com',
    selectedMedia: {
      kind: 'video',
      url: 'https://media.example/original.mp4',
      availability: 'unknown',
    },
  },
};
const sources = { get: vi.fn() };
const ingest = { start: vi.fn(), observe: vi.fn(), retry: vi.fn() };
const service = new ImportedSourceMediaService(
  sources as unknown as ImportedSourcesService,
  ingest as unknown as AgentImportedSourceIngestService,
);
const requestId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
beforeEach(() => {
  vi.clearAllMocks();
  sources.get.mockResolvedValue(source);
  for (const method of [ingest.start, ingest.observe, ingest.retry])
    method.mockResolvedValue({ state: 'not_requested' });
});
it('delegates only authoritative B1 snapshot selection and unchanged canonical actor', async () => {
  await service.start(user, source.brandId, source.id, { requestId });
  expect(sources.get).toHaveBeenCalledWith(user, source.brandId, source.id);
  expect(ingest.start).toHaveBeenCalledWith(
    {
      sourceId: source.id,
      sourceRecordVersion: source.recordVersion,
      sourceIdentityDigest: source.identityDigest,
      title: source.snapshot.title,
      selectedMedia: source.snapshot.selectedMedia,
      requestId: requestId.toLowerCase(),
    },
    {
      organizationId: user.organizationId,
      brandId: source.brandId,
      userId: user.userId,
    },
  );
});
it('observe has no request/retry fields and retry carries only its strict tuple', async () => {
  await service.observe(user, source.brandId, source.id);
  expect(ingest.observe.mock.calls[0]?.[0]).not.toHaveProperty('requestId');
  await service.retry(user, source.brandId, source.id, {
    requestId,
    expectedIngestRevision: 2,
  });
  expect(ingest.retry.mock.calls[0]?.[0]).toMatchObject({
    requestId: requestId.toLowerCase(),
    expectedIngestRevision: 2,
  });
});
it('absent selection remains absent instead of selecting pageURL or thumbnail', async () => {
  const snapshot = { ...source.snapshot, selectedMedia: undefined };
  sources.get.mockResolvedValue({ ...source, snapshot });
  await service.observe(user, source.brandId, source.id);
  expect(ingest.observe.mock.calls[0]?.[0]).not.toHaveProperty('selectedMedia');
});
it.each([
  new ForbiddenException('Session required'),
  new NotFoundException({ message: 'Source not available' }),
])(
  'preserves canonical authorization/deleted-source failures before any ingest call',
  async (error) => {
    sources.get.mockRejectedValue(error);
    await expect(
      service.start(user, source.brandId, source.id, { requestId }),
    ).rejects.toBe(error);
    await expect(service.observe(user, source.brandId, source.id)).rejects.toBe(
      error,
    );
    await expect(
      service.retry(user, source.brandId, source.id, {
        requestId,
        expectedIngestRevision: 1,
      }),
    ).rejects.toBe(error);
    expect(ingest.start).not.toHaveBeenCalled();
    expect(ingest.observe).not.toHaveBeenCalled();
    expect(ingest.retry).not.toHaveBeenCalled();
  },
);
it('direct invocation rejects unknown authority and malformed retry revision before delegation', async () => {
  for (const body of [
    { requestId, url: 'https://untrusted.example' },
    { requestId, organizationId: user.organizationId },
    { requestId: 'bad' },
  ])
    await expect(
      service.start(user, source.brandId, source.id, body),
    ).rejects.toMatchObject({ status: 400 });
  for (const expectedIngestRevision of [0, 1.5, '2'])
    await expect(
      service.retry(user, source.brandId, source.id, {
        requestId,
        expectedIngestRevision,
      }),
    ).rejects.toMatchObject({ status: 400 });
  expect(ingest.start).not.toHaveBeenCalled();
  expect(ingest.retry).not.toHaveBeenCalled();
});
