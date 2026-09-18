import { KnowledgeTranscriptIngestService } from '@api/collections/contexts/services/knowledge-transcript-ingest.service';
import {
  KnowledgeSourceKind,
  KnowledgeTranscriptState,
} from '@genfeedai/contracts';

vi.mock('@api/collections/contexts/utils/knowledge-bounded-fetch.util', () => ({
  KnowledgeFetchProhibitedError: class KnowledgeFetchProhibitedError extends Error {
    status = 403;
  },
  fetchKnowledgeBytes: vi.fn(),
  knowledgeMediaByteLimit: () => 25_000_000,
}));

import { fetchKnowledgeBytes } from '@api/collections/contexts/utils/knowledge-bounded-fetch.util';

const fetchMock = vi.mocked(fetchKnowledgeBytes);

function buildService() {
  const prisma = {
    knowledgeSourceVersion: {
      findFirst: vi.fn().mockResolvedValue({ payload: {}, provenance: {} }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const replicate = {
    transcribeAudio: vi.fn().mockResolvedValue({
      segments: [{ end: 2.5, start: 0, text: 'Hello world' }],
      text: 'Hello world',
    }),
  };
  const credits = {
    releaseReservation: vi.fn().mockResolvedValue({}),
    reserveCredits: vi.fn().mockResolvedValue({ id: 'res-1' }),
    settleReservation: vi.fn().mockResolvedValue({}),
  };
  const logger = { log: vi.fn() };
  return {
    credits,
    replicate,
    service: new KnowledgeTranscriptIngestService(
      prisma as never,
      replicate as never,
      credits as never,
      logger as never,
    ),
  };
}

describe('KnowledgeTranscriptIngestService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a published caption without charging credits', async () => {
    fetchMock.mockResolvedValue({
      bytes: Buffer.from(
        'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello from captions\n',
      ),
      finalUrl: 'https://cdn.example.com/ep.vtt',
      mimeType: 'text/vtt',
      status: 200,
    });
    const { credits, service } = buildService();
    const result = await service.resolve({
      kind: KnowledgeSourceKind.VIDEO,
      organizationId: 'org-1',
      payload: { transcriptUrl: 'https://cdn.example.com/ep.vtt' },
      referenceUrl: 'https://cdn.example.com/ep.mp4',
      sourceId: 'source-1',
      userId: 'user-1',
      versionId: 'version-1',
    });
    expect(result.transcriptState).toBe(KnowledgeTranscriptState.RESOLVED);
    expect(result.text).toContain('Hello from captions');
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('reserves, transcribes, and settles one credit for opted-in direct media', async () => {
    fetchMock.mockResolvedValue({
      bytes: Buffer.from('ID3fake-audio'),
      finalUrl: 'https://cdn.example.com/ep.mp3',
      mimeType: 'audio/mpeg',
      status: 200,
    });
    const { credits, replicate, service } = buildService();
    const result = await service.resolve({
      kind: KnowledgeSourceKind.AUDIO,
      organizationId: 'org-1',
      payload: { isTranscriptGenerationAllowed: true },
      referenceUrl: 'https://cdn.example.com/ep.mp3',
      sourceId: 'source-1',
      userId: 'user-1',
      versionId: 'version-1',
    });
    expect(result.transcriptState).toBe(KnowledgeTranscriptState.GENERATED);
    expect(credits.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        organizationId: 'org-1',
        workloadType: 'knowledge-transcript',
      }),
    );
    expect(replicate.transcribeAudio).toHaveBeenCalled();
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 1, reservationId: 'res-1' }),
    );
  });

  it('does not generate when the operator has not allowed it', async () => {
    fetchMock.mockResolvedValue({
      bytes: Buffer.from('ID3fake-audio'),
      finalUrl: 'https://cdn.example.com/ep.mp3',
      mimeType: 'audio/mpeg',
      status: 200,
    });
    const { credits, service } = buildService();
    await expect(
      service.resolve({
        kind: KnowledgeSourceKind.AUDIO,
        organizationId: 'org-1',
        payload: {},
        referenceUrl: 'https://cdn.example.com/ep.mp3',
        sourceId: 'source-1',
        userId: 'user-1',
        versionId: 'version-1',
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/no transcript/i),
      transcriptState: KnowledgeTranscriptState.UNAVAILABLE,
    });
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });
});
