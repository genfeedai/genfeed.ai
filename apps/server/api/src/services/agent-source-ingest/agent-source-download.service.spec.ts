import { Readable } from 'node:stream';
import {
  AgentSourceDownloadService,
  AgentSourceImportPendingError,
} from '@api/services/agent-source-ingest/agent-source-download.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { ConflictException } from '@nestjs/common';
import { of, throwError } from 'rxjs';

const security = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  resolveSafeDestination: vi.fn(),
}));
vi.mock('@libs/security/destination-guard', () => security);

describe('AgentSourceDownloadService', () => {
  const files = { uploadStreamToS3: vi.fn(), extractMetadataFromUrl: vi.fn() };
  const http = { get: vi.fn(), post: vi.fn() };
  const config = { get: vi.fn() };
  const logger = { error: vi.fn() };
  const context = {
    organizationId: 'org-1',
    userId: 'user-1',
    threadId: 'thread-1',
  };
  const service = new AgentSourceDownloadService(
    files as unknown as FilesClientService,
    http as unknown as HttpService,
    config as unknown as ConfigService,
    logger as unknown as LoggerService,
  );
  beforeEach(() => {
    vi.resetAllMocks();
    security.resolveSafeDestination.mockImplementation(async (url: string) => ({
      url: new URL(url),
    }));
    security.safeFetch.mockResolvedValue(
      new Response('image bytes', {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    files.uploadStreamToS3.mockImplementation(
      async (_id: string, _type: string, source: { data: Readable }) => {
        for await (const _chunk of source.data) {
          /* consume the guarded source */
        }
        return {
          publicUrl: 'https://cdn.example/source',
          s3Key: 'ingredients/images/source',
          width: 320,
          height: 240,
          size: 11,
        };
      },
    );
    config.get.mockReturnValue('http://files-service');
    files.extractMetadataFromUrl.mockResolvedValue({
      width: 1920,
      height: 1080,
      duration: 12,
      size: 900,
      hasAudio: true,
    });
  });

  it('uses guarded fetch then multipart upload and keeps returned dimensions', async () => {
    const result = await service.download(
      'https://media.example/photo.jpg',
      'source-1',
      'image',
      context,
    );
    expect(security.safeFetch).toHaveBeenCalledWith(
      'https://media.example/photo.jpg',
      { signal: expect.any(AbortSignal) },
    );
    expect(files.uploadStreamToS3).toHaveBeenCalledWith(
      'source-1',
      'images',
      expect.objectContaining({
        data: expect.any(Readable),
        contentType: 'image/jpeg',
      }),
    );
    expect(result).toMatchObject({ kind: 'image', width: 320, height: 240 });
    expect(http.post).not.toHaveBeenCalled();
  });

  afterEach(() => vi.useRealTimers());

  it('keeps a valid body streaming after the headers deadline has elapsed', async () => {
    vi.useFakeTimers();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          setTimeout(() => {
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          }, 64_000);
        },
      }),
      { headers: { 'content-type': 'video/mp4' } },
    );
    security.safeFetch.mockResolvedValue(response);
    const result = service.download(
      'https://media.example/video.mp4',
      'source-1',
      'video',
      context,
    );
    const completed = expect(result).resolves.toMatchObject({ kind: 'video' });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(security.safeFetch.mock.calls[0]?.[1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(3_000);
    await completed;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a stalled body at its separate five-minute deadline', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    security.safeFetch.mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        headers: { 'content-type': 'video/mp4' },
      }),
    );
    const result = service.download(
      'https://media.example/video.mp4',
      'source-1',
      'video',
      context,
    );
    const rejected = expect(result).rejects.toThrow(
      'five-minute transfer limit',
    );
    await vi.advanceTimersByTimeAsync(300_000);
    await rejected;
    expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still aborts an endpoint that never returns headers after sixty seconds', async () => {
    vi.useFakeTimers();
    security.safeFetch.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(options.signal.reason),
            { once: true },
          );
        }),
    );
    const result = service.download(
      'https://media.example/video.mp4',
      'source-1',
      'video',
      context,
    );
    const rejected = expect(result).rejects.toThrow(
      'response headers timed out',
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await rejected;
    expect(files.uploadStreamToS3).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates destination rejection without a fallback fetch/upload', async () => {
    security.safeFetch.mockRejectedValue(
      new Error('private destination blocked'),
    );
    await expect(
      service.download('http://127.0.0.1/source', 'source-1', 'image', context),
    ).rejects.toThrow('private destination blocked');
    expect(files.uploadStreamToS3).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('rejects HTML and a mismatched requested media kind before storage', async () => {
    security.safeFetch.mockResolvedValueOnce(
      new Response('<html>page</html>', {
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(
      service.download(
        'https://media.example/page',
        'source-1',
        undefined,
        context,
      ),
    ).rejects.toThrow('supported media');
    await expect(
      service.download(
        'https://media.example/photo.jpg',
        'source-1',
        'video',
        context,
      ),
    ).rejects.toThrow('selected kind');
    expect(files.uploadStreamToS3).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared source before uploading', async () => {
    security.safeFetch.mockResolvedValue(
      new Response('bytes', {
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(201 * 1024 * 1024),
        },
      }),
    );
    await expect(
      service.download(
        'https://media.example/video.mp4',
        'source-1',
        undefined,
        context,
      ),
    ).rejects.toThrow('200 MB');
    expect(files.uploadStreamToS3).not.toHaveBeenCalled();
  });

  it('enforces the byte limit when content-length is absent', async () => {
    let chunks = 0;
    const chunk = new Uint8Array(1024 * 1024);
    security.safeFetch.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            if (chunks++ < 201) controller.enqueue(chunk);
            else controller.close();
          },
        }),
        { headers: { 'content-type': 'video/mp4' } },
      ),
    );
    await expect(
      service.download(
        'https://media.example/video.mp4',
        'source-1',
        undefined,
        context,
      ),
    ).rejects.toThrow('200 MB');
  });

  it('normalizes a YouTube video while removing tracking and rejects malformed video URLs', async () => {
    expect(
      await service.normalizeUrl('https://youtu.be/abcdefghijk?tracking=1'),
    ).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    await expect(
      service.normalizeUrl('https://www.youtube.com/redirect?q=attacker'),
    ).rejects.toThrow('valid HTTPS YouTube');
  });

  it('queues only deterministic extraction and records the existing source artifact', async () => {
    http.post.mockReturnValue(of({ data: { jobId: 'agent-source-source-1' } }));
    http.get.mockReturnValue(
      of({
        data: {
          status: 'completed',
          result: {
            sourceUrl: 'https://cdn.example/video',
            sourceS3Key: 'videos/source',
            sourceDurationSeconds: 12,
          },
        },
      }),
    );
    const queued = vi.fn();
    const result = await service.download(
      'https://www.youtube.com/watch?v=abcdefghijk',
      'source-1',
      'video',
      context,
      undefined,
      queued,
    );
    expect(queued).toHaveBeenCalledWith('agent-source-source-1');
    expect(queued.mock.invocationCallOrder[0]).toBeLessThan(
      http.post.mock.invocationCallOrder[0] ?? 0,
    );
    expect(http.post).toHaveBeenCalledWith(
      'http://files-service/v1/files/process/video',
      expect.objectContaining({
        type: 'video-to-audio',
        organizationId: 'org-1',
        ingredientId: 'source-1',
      }),
      { timeout: 30000 },
    );
    expect(result).toMatchObject({
      storageKey: 'videos/source',
      duration: 12,
      width: 1920,
    });
    expect(files.uploadStreamToS3).not.toHaveBeenCalled();
  });

  it('resumes an existing extraction without enqueueing another job', async () => {
    http.get.mockReturnValue(
      of({
        data: {
          status: 'completed',
          result: {
            sourceUrl: 'https://cdn.example/video',
            sourceS3Key: 'videos/source',
          },
        },
      }),
    );
    await service.download(
      'https://www.youtube.com/watch?v=abcdefghijk',
      'source-1',
      'video',
      context,
      'existing-job',
    );
    expect(http.post).not.toHaveBeenCalled();
    expect(http.get).toHaveBeenCalledWith(
      'http://files-service/v1/files/job/existing-job',
      { timeout: 30000 },
    );
  });

  it.each([
    {},
    { sourceUrl: 'https://cdn.example/video' },
    { sourceS3Key: 'videos/source' },
    { sourceUrl: '', sourceS3Key: 'videos/source' },
    { sourceUrl: 'https://cdn.example/video', sourceS3Key: '  ' },
  ])(
    'treats completed extraction with an invalid artifact as terminal (%j)',
    async (result) => {
      http.post.mockReturnValue(
        of({ data: { jobId: 'agent-source-source-1' } }),
      );
      http.get.mockReturnValue(of({ data: { status: 'COMPLETED', result } }));
      const download = service.download(
        'https://www.youtube.com/watch?v=abcdefghijk',
        'source-1',
        'video',
        context,
      );
      await expect(download).rejects.toThrow(
        'completed without a durable video',
      );
      await expect(download).rejects.not.toBeInstanceOf(
        AgentSourceImportPendingError,
      );
      expect(http.post).toHaveBeenCalledTimes(1);
      expect(files.extractMetadataFromUrl).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('does not leave a resumed completed extraction pending when its artifact is missing', async () => {
    http.get.mockReturnValue(of({ data: { state: 'completed', result: {} } }));
    const download = service.download(
      'https://www.youtube.com/watch?v=abcdefghijk',
      'source-1',
      'video',
      context,
      'existing-job',
    );
    await expect(download).rejects.toThrow('completed without a durable video');
    await expect(download).rejects.not.toBeInstanceOf(
      AgentSourceImportPendingError,
    );
    expect(http.post).not.toHaveBeenCalled();
    expect(files.extractMetadataFromUrl).not.toHaveBeenCalled();
  });

  it('reports uncertain remote execution separately so retry cannot duplicate it', async () => {
    const cause = new Error('network lost');
    http.get.mockReturnValue(throwError(() => cause));
    await expect(
      service.download(
        'https://www.youtube.com/watch?v=abcdefghijk',
        'source-1',
        'video',
        context,
        'existing-job',
      ),
    ).rejects.toMatchObject({ cause });
    expect(http.post).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Source extraction could not be observed',
      cause,
      expect.objectContaining({ ingredientId: 'source-1' }),
    );
  });
  it('persists identity before a lost enqueue response and later observes that job', async () => {
    const persisted = vi.fn();
    http.post.mockReturnValue(throwError(() => new Error('response lost')));
    await expect(
      service.download(
        'https://www.youtube.com/watch?v=abcdefghijk',
        'source-1',
        'video',
        context,
        undefined,
        persisted,
      ),
    ).rejects.toBeInstanceOf(AgentSourceImportPendingError);
    expect(persisted).toHaveBeenCalledWith('agent-source-source-1');
    http.get.mockReturnValue(
      of({
        data: {
          state: 'completed',
          data: { id: 'agent-source-source-1', type: 'video-to-audio' },
          result: {
            sourceUrl: 'https://cdn.example/video',
            sourceS3Key: 'videos/source',
          },
        },
      }),
    );
    const result = await service.download(
      'https://www.youtube.com/watch?v=abcdefghijk',
      'source-1',
      'video',
      context,
      'agent-source-source-1',
    );
    expect(result.storageKey).toBe('videos/source');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Error('persistence unavailable'),
    new ConflictException('scope changed'),
  ])(
    'does not classify a failed pre-enqueue identity write as pending (%s)',
    async (failure) => {
      const persisted = vi.fn().mockRejectedValue(failure);
      await expect(
        service.download(
          'https://www.youtube.com/watch?v=abcdefghijk',
          'source-1',
          'video',
          context,
          undefined,
          persisted,
        ),
      ).rejects.toBe(failure);
      expect(http.post).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it.each([404, 500])(
    're-enqueues the same durable identity when observation explicitly reports missing (%s)',
    async (status) => {
      http.get
        .mockReturnValueOnce(
          throwError(() => ({
            response: { status, data: { message: 'Job not found' } },
          })),
        )
        .mockReturnValueOnce(
          of({
            data: {
              state: 'completed',
              data: { id: 'agent-source-source-1' },
              result: {
                sourceUrl: 'https://cdn.example/video',
                sourceS3Key: 'videos/source',
              },
            },
          }),
        );
      http.post.mockReturnValue(
        of({ data: { jobId: 'agent-source-source-1' } }),
      );
      await service.download(
        'https://www.youtube.com/watch?v=abcdefghijk',
        'source-1',
        'video',
        context,
        'agent-source-source-1',
      );
      expect(http.post).toHaveBeenCalledTimes(1);
      expect(http.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ id: 'agent-source-source-1' }),
        expect.any(Object),
      );
    },
  );

  it('does not retry enqueue repeatedly or on an ambiguous internal failure', async () => {
    http.get.mockReturnValue(
      throwError(() => ({
        response: { status: 500, data: { message: 'Redis unavailable' } },
      })),
    );
    await expect(
      service.download(
        'https://www.youtube.com/watch?v=abcdefghijk',
        'source-1',
        'video',
        context,
        'agent-source-source-1',
      ),
    ).rejects.toBeInstanceOf(AgentSourceImportPendingError);
    expect(http.post).not.toHaveBeenCalled();
    http.get.mockReturnValue(throwError(() => ({ response: { status: 404 } })));
    http.post.mockReturnValue(of({ data: { jobId: 'agent-source-source-1' } }));
    await expect(
      service.download(
        'https://www.youtube.com/watch?v=abcdefghijk',
        'source-1',
        'video',
        context,
        'agent-source-source-1',
      ),
    ).rejects.toBeInstanceOf(AgentSourceImportPendingError);
    expect(http.post).toHaveBeenCalledTimes(1);
  });
});
