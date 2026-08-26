import { PublicYoutubeClipsService } from '@api/endpoints/public/services/public-youtube-clips.service';
import type { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type {
  PublicClipToolStoreService,
  StoredPublicYoutubeClipSession,
} from '@api/services/public-clip-tool/public-clip-tool-store.service';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';

const token = 'a'.repeat(43);
const storedSession: StoredPublicYoutubeClipSession = {
  createdAt: '2026-08-26T10:00:00.000Z',
  expiresAt: '2026-08-26T12:00:00.000Z',
  highlights: [],
  id: 'session-1',
  language: 'en',
  preview: { status: 'available' },
  progress: 0,
  sourceFingerprint: 'fingerprint',
  sourceVideoUrl: 'https://www.youtube.com/watch?v=abc12345',
  status: 'queued',
  transcriptSegments: [],
};

describe('PublicYoutubeClipsService', () => {
  const queue = { enqueue: vi.fn() };
  const files = { getJobStatus: vi.fn(), processVideo: vi.fn() };
  const http = { get: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const store = {
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    getSession: vi.fn(),
    patchByToken: vi.fn(),
    reservePreview: vi.fn(),
    toWorkerProjectId: vi.fn(),
  };
  let service: PublicYoutubeClipsService;

  beforeEach(() => {
    vi.clearAllMocks();
    http.get.mockReturnValue(of({ data: { title: 'Public video' } }));
    store.createSession.mockResolvedValue({
      isNew: true,
      previewToken: token,
      session: storedSession,
    });
    store.toWorkerProjectId.mockReturnValue(
      `public-youtube-clip-session-${'f'.repeat(64)}`,
    );
    queue.enqueue.mockResolvedValue({ id: 'analysis-job' });
    service = new PublicYoutubeClipsService(
      queue as unknown as ClipAnalyzeQueueService,
      files as unknown as FileQueueService,
      http as unknown as HttpService,
      logger as unknown as LoggerService,
      store as unknown as PublicClipToolStoreService,
    );
  });

  it('normalizes YouTube URLs before storage and uses the free model with fallback', async () => {
    await service.create(
      'https://youtu.be/abc12345?si=tracking',
      'request-key-1',
    );

    expect(http.get).toHaveBeenCalledWith('https://www.youtube.com/oembed', {
      params: {
        format: 'json',
        url: 'https://www.youtube.com/watch?v=abc12345',
      },
      timeout: 5_000,
    });
    expect(store.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'request-key-1',
        sourceVideoUrl: 'https://www.youtube.com/watch?v=abc12345',
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        highlightFallback: 'deterministic',
        highlightModel: AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE,
        maxClips: 3,
        projectId: `public-youtube-clip-session-${'f'.repeat(64)}`,
      }),
    );
  });

  it.each([
    'https://evil.example/watch?v=abc12345',
    'https://youtube.com.evil.example/watch?v=abc12345',
    'file:///etc/passwd',
    'https://www.youtube.com/channel/abc12345',
  ])(
    'rejects unsupported source %s before any cost-bearing work',
    async (url) => {
      await expect(service.create(url)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(http.get).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    },
  );

  it('does not enqueue a second analysis for an idempotent replay', async () => {
    store.createSession.mockResolvedValue({
      isNew: false,
      previewToken: token,
      session: storedSession,
    });

    await service.create(
      'https://www.youtube.com/watch?v=abc12345',
      'request-key-1',
    );

    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
