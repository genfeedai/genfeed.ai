import { KnowledgeTranscriptIngestService } from '@api/collections/contexts/services/knowledge-transcript-ingest.service';
import {
  CreditReservationStatus,
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
    knowledgeCaptureRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
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
    reserveCredits: vi.fn().mockResolvedValue({
      id: 'res-1',
      status: CreditReservationStatus.RESERVED,
    }),
    settleReservation: vi.fn().mockResolvedValue({}),
  };
  const logger = { log: vi.fn() };
  return {
    credits,
    prisma,
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
    expect(replicate.transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ filename: 'knowledge-media.mp3' }),
      }),
    );
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 1, reservationId: 'res-1' }),
    );
  });

  it('saves the transcript before settling and never charges for an unsaved one', async () => {
    fetchMock.mockResolvedValue({
      bytes: Buffer.from('ID3fake-audio'),
      finalUrl: 'https://cdn.example.com/ep.mp3',
      mimeType: 'audio/mpeg',
      status: 200,
    });
    const { credits, prisma, service } = buildService();
    // The first write records the generation claim; the second is the
    // transcript checkpoint, which fails here.
    prisma.knowledgeSourceVersion.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      service.resolve({
        kind: KnowledgeSourceKind.AUDIO,
        organizationId: 'org-1',
        payload: { isTranscriptGenerationAllowed: true },
        referenceUrl: 'https://cdn.example.com/ep.mp3',
        sourceId: 'source-1',
        userId: 'user-1',
        versionId: 'version-1',
      }),
    ).rejects.toThrow('connection reset');
    expect(credits.settleReservation).not.toHaveBeenCalled();
    expect(credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'res-1',
    });
  });

  it('settles only after the transcript checkpoint is written', async () => {
    fetchMock.mockResolvedValue({
      bytes: Buffer.from('ID3fake-audio'),
      finalUrl: 'https://cdn.example.com/ep.mp3',
      mimeType: 'audio/mpeg',
      status: 200,
    });
    const { credits, prisma, service } = buildService();

    await service.resolve({
      kind: KnowledgeSourceKind.AUDIO,
      organizationId: 'org-1',
      payload: { isTranscriptGenerationAllowed: true },
      referenceUrl: 'https://cdn.example.com/ep.mp3',
      sourceId: 'source-1',
      userId: 'user-1',
      versionId: 'version-1',
    });

    const checkpointOrder =
      prisma.knowledgeSourceVersion.updateMany.mock.invocationCallOrder[1];
    const settleOrder = credits.settleReservation.mock.invocationCallOrder[0];
    expect(checkpointOrder).toBeLessThan(settleOrder);
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

  it('does not start a second Whisper job while the generation lease is live', async () => {
    fetchMock.mockResolvedValue({
      bytes: Buffer.from('ID3fake-audio'),
      finalUrl: 'https://cdn.example.com/ep.mp3',
      mimeType: 'audio/mpeg',
      status: 200,
    });
    const { credits, replicate, service } = buildService();
    const prisma = (
      service as unknown as {
        prisma: {
          knowledgeSourceVersion: { findFirst: ReturnType<typeof vi.fn> };
        };
      }
    ).prisma;
    prisma.knowledgeSourceVersion.findFirst.mockResolvedValue({
      payload: {
        isTranscriptGenerationAllowed: true,
        transcriptGeneration: {
          attempt: 0,
          leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          reservationId: 'res-live',
        },
      },
      transcriptState: null,
    });
    await expect(
      service.resolve({
        kind: KnowledgeSourceKind.AUDIO,
        organizationId: 'org-1',
        payload: { isTranscriptGenerationAllowed: true },
        referenceUrl: 'https://cdn.example.com/ep.mp3',
        sourceId: 'source-1',
        userId: 'user-1',
        versionId: 'version-1',
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/already in progress/i),
    });
    expect(replicate.transcribeAudio).not.toHaveBeenCalled();
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('opens a new reservation after a released prior attempt', async () => {
    fetchMock.mockResolvedValue({
      bytes: Buffer.from('ID3fake-audio'),
      finalUrl: 'https://cdn.example.com/ep.mp3',
      mimeType: 'audio/mpeg',
      status: 200,
    });
    const { credits, service } = buildService();
    credits.reserveCredits
      .mockResolvedValueOnce({
        id: 'res-old',
        status: CreditReservationStatus.RELEASED,
      })
      .mockResolvedValueOnce({
        id: 'res-2',
        status: CreditReservationStatus.RESERVED,
      });
    await service.resolve({
      kind: KnowledgeSourceKind.AUDIO,
      organizationId: 'org-1',
      payload: { isTranscriptGenerationAllowed: true },
      referenceUrl: 'https://cdn.example.com/ep.mp3',
      sourceId: 'source-1',
      userId: 'user-1',
      versionId: 'version-1',
    });
    expect(credits.reserveCredits).toHaveBeenCalledTimes(2);
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: 'res-2' }),
    );
  });
});
