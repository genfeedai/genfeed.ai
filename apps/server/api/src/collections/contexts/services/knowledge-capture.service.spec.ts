import {
  buildCaptureVersion,
  hashKnowledgeContent,
  KnowledgeCaptureService,
} from '@api/collections/contexts/services/knowledge-capture.service';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

const actor = { organizationId: 'org-1', userId: 'user-1', brandId: 'brand-1' };
const base = {
  kind: KnowledgeSourceKind.TEXT,
  purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
  scope: KnowledgeMemoryScope.BRAND,
  title: 'Pricing',
};

function buildService() {
  const records = {
    createSource: vi.fn().mockResolvedValue({ id: 'source-1' }),
    createVersion: vi.fn().mockResolvedValue({ id: 'version-1', version: 1 }),
    getCurrentVersion: vi.fn(),
    setProcessing: vi.fn().mockResolvedValue({
      id: 'version-1',
      processingState: KnowledgeProcessingState.QUEUED,
    }),
  };
  const workflow = {
    enqueueBackfill: vi.fn().mockResolvedValue('backfill-job'),
    enqueueIngest: vi.fn().mockResolvedValue('ingest-job'),
  };
  return {
    records,
    service: new KnowledgeCaptureService(records as never, workflow as never),
    workflow,
  };
}

describe('KnowledgeCaptureService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates the source, its first version and one ingest job per capture', async () => {
    const { service, records, workflow } = buildService();

    const result = await service.capture(actor, {
      ...base,
      text: 'Plans start at $29.',
    });

    expect(records.createSource).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ title: 'Pricing' }),
    );
    expect(records.createVersion).toHaveBeenCalledWith(
      actor,
      'source-1',
      expect.objectContaining({
        contentHash: hashKnowledgeContent('Plans start at $29.'),
        payload: { text: 'Plans start at $29.' },
        provenance: expect.objectContaining({
          capturedBy: 'api',
          title: 'Pricing',
        }),
      }),
    );
    expect(workflow.enqueueIngest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sourceId: 'source-1',
      versionId: 'version-1',
    });
    expect(result).toEqual({
      jobId: 'ingest-job',
      source: { id: 'source-1' },
      version: { id: 'version-1', version: 1 },
    });
  });

  it('creates a metadata-only source when nothing is captured', async () => {
    const { service, records, workflow } = buildService();

    await expect(service.capture(actor, base)).resolves.toEqual({
      source: { id: 'source-1' },
    });
    expect(records.createVersion).not.toHaveBeenCalled();
    expect(workflow.enqueueIngest).not.toHaveBeenCalled();
  });

  it('rejects captures the workflow cannot ingest before writing anything', async () => {
    const { service, records } = buildService();

    await expect(
      service.capture(actor, {
        ...base,
        kind: KnowledgeSourceKind.VIDEO,
        referenceUrl: 'https://video.example/clip',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.capture(actor, {
        ...base,
        kind: KnowledgeSourceKind.URL,
        text: 'no url',
      }),
    ).rejects.toThrow('URL sources require a reference URL');
    await expect(
      service.capture(actor, {
        ...base,
        referenceUrl: 'https://brand.example',
      }),
    ).rejects.toThrow('TEXT sources require captured text');
    expect(records.createSource).not.toHaveBeenCalled();
  });

  it('hashes fetched sources by location and merges caller provenance', () => {
    const version = buildCaptureVersion(
      {
        provenance: { capturedBy: 'extension', selection: true },
        referenceUrl: 'https://brand.example/pricing',
        title: 'Pricing',
      },
      new Date('2026-09-06T10:00:00.000Z'),
    );

    expect(version).toEqual({
      contentHash: hashKnowledgeContent('https://brand.example/pricing'),
      observedAt: '2026-09-06T10:00:00.000Z',
      payload: { referenceUrl: 'https://brand.example/pricing' },
      provenance: {
        capturedAt: '2026-09-06T10:00:00.000Z',
        capturedBy: 'extension',
        selection: true,
        title: 'Pricing',
        url: 'https://brand.example/pricing',
      },
    });
    expect(version.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('requeues only failed or queued current versions and reuses their identity', async () => {
    const { service, records, workflow } = buildService();
    records.getCurrentVersion.mockResolvedValueOnce({
      id: 'version-1',
      processingState: KnowledgeProcessingState.FAILED,
    });

    await expect(service.retry(actor, 'source-1')).resolves.toEqual({
      jobId: 'ingest-job',
      version: { id: 'version-1', processingState: 'QUEUED' },
    });
    expect(records.setProcessing).toHaveBeenCalledWith(
      actor,
      'source-1',
      'version-1',
      KnowledgeProcessingState.QUEUED,
    );
    expect(workflow.enqueueIngest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sourceId: 'source-1',
      versionId: 'version-1',
    });

    records.getCurrentVersion.mockResolvedValueOnce({
      id: 'version-1',
      processingState: KnowledgeProcessingState.QUEUED,
    });
    await service.retry(actor, 'source-1');
    expect(records.setProcessing).toHaveBeenCalledTimes(1);

    records.getCurrentVersion.mockResolvedValueOnce({
      id: 'version-1',
      processingState: KnowledgeProcessingState.READY,
    });
    await expect(service.retry(actor, 'source-1')).rejects.toThrow(
      'already ingested',
    );
    records.getCurrentVersion.mockResolvedValueOnce({
      id: 'version-1',
      processingState: KnowledgeProcessingState.PROCESSING,
    });
    await expect(service.retry(actor, 'source-1')).rejects.toThrow(
      'still being ingested',
    );
  });

  it('queues one tenant-scoped backfill', async () => {
    const { service, workflow } = buildService();

    await expect(service.backfill('org-1')).resolves.toEqual({
      jobId: 'backfill-job',
    });
    expect(workflow.enqueueBackfill).toHaveBeenCalledWith({
      organizationId: 'org-1',
    });
  });
});
