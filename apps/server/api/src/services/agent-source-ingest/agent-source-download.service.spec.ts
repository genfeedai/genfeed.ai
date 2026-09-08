import { Readable } from 'node:stream';
import {
  AgentSourceDownloadService,
  AgentSourceImportPendingError,
} from '@api/services/agent-source-ingest/agent-source-download.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { ConfigService } from '@libs/config/config.service';
import type { HttpService } from '@nestjs/axios';
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
  const context = {
    organizationId: 'org-1',
    userId: 'user-1',
    threadId: 'thread-1',
  };
  const service = new AgentSourceDownloadService(
    files as unknown as FilesClientService,
    http as unknown as HttpService,
    config as unknown as ConfigService,
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
    http.post.mockReturnValue(of({ data: { jobId: 'source-job' } }));
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
    expect(queued).toHaveBeenCalledWith('source-job');
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

  it('reports uncertain remote execution separately so retry cannot duplicate it', async () => {
    http.get.mockReturnValue(throwError(() => new Error('network lost')));
    await expect(
      service.download(
        'https://www.youtube.com/watch?v=abcdefghijk',
        'source-1',
        'video',
        context,
        'existing-job',
      ),
    ).rejects.toBeInstanceOf(AgentSourceImportPendingError);
    expect(http.post).not.toHaveBeenCalled();
  });
});
