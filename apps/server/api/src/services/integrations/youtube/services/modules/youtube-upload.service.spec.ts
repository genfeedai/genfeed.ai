import { Readable } from 'node:stream';
import { BrandCoverStyleService } from '@api/collections/brands/services/brand-cover-style.service';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeUploadService } from '@api/services/integrations/youtube/services/modules/youtube-upload.service';
import { TagResolutionService } from '@api/shared/services/tag-resolution/tag-resolution.service';
import { PostStatus, PostVisibility } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

// Mock googleapis
const mockVideosInsert = vi.fn();
const mockPlaylistItemsInsert = vi.fn();
const mockThumbnailsSet = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    youtube: () => ({
      playlistItems: { insert: mockPlaylistItemsInsert },
      thumbnails: { set: mockThumbnailsSet },
      videos: { insert: mockVideosInsert },
    }),
  },
}));

// Mock htmlToText
vi.mock('@api/shared/utils/html-to-text/html-to-text.util', () => ({
  htmlToText: vi.fn((html: string) => html || ''),
}));

const THUMBNAIL_URL = 'https://cdn.test.com/thumbnails/frame.jpg';

describe('YoutubeUploadService', () => {
  let service: YoutubeUploadService;
  let mediaStream: Readable;
  let httpService: { get: ReturnType<typeof vi.fn> };
  let fileQueueService: {
    processFile: ReturnType<typeof vi.fn>;
    waitForJob: ReturnType<typeof vi.fn>;
  };
  let brandCoverStyle: { resolveTitleStyle: ReturnType<typeof vi.fn> };
  let tagResolutionService: { resolveTagLabels: ReturnType<typeof vi.fn> };
  let authService: { refreshToken: ReturnType<typeof vi.fn> };
  let filesClient: { generateThumbnail: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockAuth = { credentials: { access_token: 'test-token' } };
  const orgId = 'test-object-id';
  const brandId = 'test-object-id';
  const videoId = 'test-object-id';

  function createPost(
    overrides: Omit<Partial<PostEntity>, 'status' | 'visibility'> & {
      status?: PostStatus | string;
      visibility?: PostVisibility | string;
    } = {},
  ): PostEntity {
    const fixture = {
      id: 'test-object-id',
      description: '<p>Test description</p>',
      label: 'Test Video',
      scheduledDate: null,
      status: PostStatus.PUBLIC,
      tags: ['test-object-id'],
      visibility: PostVisibility.PUBLIC,
      ...overrides,
    };
    return new PostEntity(fixture);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mediaStream = Readable.from([Buffer.from('original video')]);
    httpService = {
      get: vi.fn((url: string) =>
        of({
          data: url === THUMBNAIL_URL ? Buffer.from('jpeg bytes') : mediaStream,
        }),
      ),
    };
    filesClient = {
      generateThumbnail: vi
        .fn()
        .mockResolvedValue({ thumbnailUrl: THUMBNAIL_URL }),
    };

    fileQueueService = {
      processFile: vi.fn().mockResolvedValue({ jobId: 'job-123' }),
      waitForJob: vi
        .fn()
        .mockResolvedValue({ outputPath: '/tmp/test-video.mp4' }),
    };

    brandCoverStyle = {
      resolveTitleStyle: vi.fn().mockResolvedValue(undefined),
    };

    tagResolutionService = {
      resolveTagLabels: vi.fn().mockResolvedValue(['ai', 'tech']),
    };

    authService = {
      refreshToken: vi.fn().mockResolvedValue(mockAuth),
    };

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    mockThumbnailsSet.mockResolvedValue({ data: {} });
    mockVideosInsert.mockResolvedValue({ data: { id: 'yt-uploaded-123' } });
    mockPlaylistItemsInsert.mockResolvedValue({ data: { id: 'playlist-1' } });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeUploadService,
        { provide: HttpService, useValue: httpService },
        { provide: FileQueueService, useValue: fileQueueService },
        { provide: TagResolutionService, useValue: tagResolutionService },
        { provide: YoutubeAuthService, useValue: authService },
        { provide: FilesClientService, useValue: filesClient },
        { provide: BrandCoverStyleService, useValue: brandCoverStyle },
        { provide: LoggerService, useValue: loggerService },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(''),
            ingredientsEndpoint: 'https://api.test.com/ingredients',
          },
        },
      ],
    }).compile();

    service = module.get<YoutubeUploadService>(YoutubeUploadService);
  });

  it('streams the original video without reading another container’s file path', async () => {
    await service.uploadVideo(orgId, brandId, videoId, createPost());
    expect(mockVideosInsert).toHaveBeenCalledWith(
      expect.objectContaining({ media: { body: mediaStream } }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fileQueueService.processFile).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aborts a continuously streaming upload at the total deadline', async () => {
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    const deadline = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => nativeTimeout(20));
    let chunks = 0;
    mediaStream = Readable.from(
      (async function* () {
        while (true) {
          yield Buffer.from('video chunk');
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      })(),
    );
    httpService.get.mockReturnValueOnce(of({ data: mediaStream }));
    mockVideosInsert.mockImplementationOnce(
      (_params, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const signal = options.signal;
          if (!signal) {
            reject(new Error('Missing upload deadline'));
            return;
          }
          mediaStream.on('data', () => {
            chunks += 1;
          });
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    await expect(
      service.uploadVideo(orgId, brandId, videoId, createPost()),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(deadline).toHaveBeenCalledWith(10 * 60_000);
    expect(httpService.get.mock.calls[0]?.[1]?.signal).toBe(
      mockVideosInsert.mock.calls[0]?.[1]?.signal,
    );
    expect(chunks).toBeGreaterThan(0);
    expect(mediaStream.destroyed).toBe(true);
  });

  describe('custom thumbnail', () => {
    it('sets a 1080px still from the source video on the uploaded video', async () => {
      await service.uploadVideo(orgId, brandId, videoId, createPost());

      expect(filesClient.generateThumbnail).toHaveBeenCalledWith(
        `https://api.test.com/ingredients/videos/${videoId}`,
        videoId,
        1,
        1080,
        undefined,
        true,
        undefined,
      );
      expect(mockThumbnailsSet).toHaveBeenCalledTimes(1);
      const params = mockThumbnailsSet.mock.calls[0][0];
      expect(params).toMatchObject({
        auth: mockAuth,
        media: { mimeType: 'image/jpeg' },
        videoId: 'yt-uploaded-123',
      });
      const chunks: Buffer[] = [];
      for await (const chunk of params.media.body) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe('jpeg bytes');
    });

    it('renders the cover from the post’s title and frame settings', async () => {
      await service.uploadVideo(orgId, brandId, videoId, createPost(), {
        thumbnailFrameSeconds: '4.5',
        thumbnailText: '  Ship the studio  ',
      });

      expect(filesClient.generateThumbnail).toHaveBeenCalledWith(
        expect.any(String),
        videoId,
        4.5,
        1080,
        'Ship the studio',
        true,
        undefined,
      );
    });

    it('renders the cover in the style of the brand it publishes for', async () => {
      const titleStyle = { accentColor: '#E83B3B', fontFamily: 'INTER_BOLD' };
      brandCoverStyle.resolveTitleStyle.mockResolvedValueOnce(titleStyle);

      await service.uploadVideo(orgId, brandId, videoId, createPost(), {
        thumbnailText: 'Ship the studio',
      });

      expect(brandCoverStyle.resolveTitleStyle).toHaveBeenCalledWith(
        brandId,
        orgId,
      );
      expect(filesClient.generateThumbnail).toHaveBeenCalledWith(
        expect.any(String),
        videoId,
        1,
        1080,
        'Ship the studio',
        true,
        titleStyle,
      );
    });

    it('falls back to the default frame when the frame setting is not a number', async () => {
      await service.uploadVideo(orgId, brandId, videoId, createPost(), {
        thumbnailFrameSeconds: 'soon',
      });

      expect(filesClient.generateThumbnail).toHaveBeenCalledWith(
        expect.any(String),
        videoId,
        1,
        1080,
        undefined,
        true,
        undefined,
      );
    });

    it('still returns the video id when the frame cannot be generated', async () => {
      filesClient.generateThumbnail.mockRejectedValueOnce(new Error('ffmpeg'));

      await expect(
        service.uploadVideo(orgId, brandId, videoId, createPost()),
      ).resolves.toBe('yt-uploaded-123');
      expect(mockThumbnailsSet).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('still returns the video id when YouTube rejects the thumbnail', async () => {
      mockThumbnailsSet.mockRejectedValueOnce(new Error('forbidden'));

      await expect(
        service.uploadVideo(orgId, brandId, videoId, createPost()),
      ).resolves.toBe('yt-uploaded-123');
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to set custom thumbnail'),
        expect.objectContaining({ youtubeVideoId: 'yt-uploaded-123' }),
      );
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should upload a video and return the YouTube video ID', async () => {
    const post = createPost();

    const result = await service.uploadVideo(orgId, brandId, videoId, post);

    expect(result).toBe('yt-uploaded-123');
    expect(authService.refreshToken).toHaveBeenCalledWith(
      orgId,
      brandId,
      undefined,
    );
    expect(httpService.get).toHaveBeenCalledWith(
      `https://api.test.com/ingredients/videos/${videoId}`,
      {
        responseType: 'stream',
        signal: expect.any(AbortSignal),
        timeout: 30_000,
      },
    );
    expect(mockVideosInsert.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        auth: mockAuth,
        part: ['snippet', 'status'],
      }),
    );
  });

  it('should resolve tag labels for the post tags', async () => {
    const tags = ['test-object-id', 'test-object-id'];
    const post = createPost({ tags });

    await service.uploadVideo(orgId, brandId, videoId, post);

    expect(tagResolutionService.resolveTagLabels).toHaveBeenCalledWith(tags);
  });

  it('should set privacy to PUBLIC for public posts', async () => {
    const post = createPost({ visibility: PostVisibility.PUBLIC });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.status).toEqual({
      privacyStatus: PostVisibility.PUBLIC,
    });
  });

  it('should set privacy to PRIVATE for private posts', async () => {
    const post = createPost({ visibility: PostVisibility.PRIVATE });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.status).toEqual({
      privacyStatus: PostVisibility.PRIVATE,
    });
  });

  it('should set privacy to UNLISTED for unlisted posts', async () => {
    const post = createPost({ visibility: PostVisibility.UNLISTED });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.status).toEqual({
      privacyStatus: PostVisibility.UNLISTED,
    });
  });

  it('should upload as PRIVATE with publishAt for future scheduled dates', async () => {
    const futureDate = new Date(Date.now() + 86400000); // tomorrow
    const post = createPost({
      scheduledDate: futureDate,
      status: PostStatus.SCHEDULED,
    });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.status).toEqual({
      privacyStatus: PostStatus.PRIVATE,
      publishAt: futureDate.toISOString(),
    });
  });

  it('should upload as PUBLIC for SCHEDULED posts with past dates', async () => {
    const pastDate = new Date(Date.now() - 86400000); // yesterday
    const post = createPost({
      scheduledDate: pastDate,
      status: PostStatus.SCHEDULED,
    });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.status).toEqual({
      privacyStatus: PostStatus.PUBLIC,
    });
  });

  it('should default unknown visibility to PUBLIC', async () => {
    const post = createPost({ visibility: 'some-unknown-visibility' });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.status).toEqual({
      privacyStatus: PostVisibility.PUBLIC,
    });
  });

  it('should throw when YouTube API returns no id', async () => {
    mockVideosInsert.mockResolvedValueOnce({ data: { id: null } });
    const post = createPost();

    await expect(
      service.uploadVideo(orgId, brandId, videoId, post),
    ).rejects.toThrow('Failed to upload video');
  });

  it('closes the source stream after successful upload', async () => {
    const post = createPost();

    await service.uploadVideo(orgId, brandId, videoId, post);

    expect(mediaStream.destroyed).toBe(true);
  });

  it('should use default title when post.label is empty', async () => {
    const post = createPost({ label: '' });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.snippet.title).toBe('Genfeed.ai Video');
  });

  it('should rethrow errors from the upload process', async () => {
    mockVideosInsert.mockRejectedValueOnce(new Error('Upload failed'));
    const post = createPost();

    await expect(
      service.uploadVideo(orgId, brandId, videoId, post),
    ).rejects.toThrow('Upload failed');
    expect(loggerService.error).toHaveBeenCalled();
    expect(mediaStream.destroyed).toBe(true);
  });

  it('should handle empty tags array', async () => {
    const post = createPost({ tags: [] });

    await service.uploadVideo(orgId, brandId, videoId, post);

    expect(tagResolutionService.resolveTagLabels).toHaveBeenCalledWith([]);
  });

  it('does not publish when the source download fails', async () => {
    httpService.get.mockReturnValueOnce(
      throwError(() => new Error('Source unavailable')),
    );
    await expect(
      service.uploadVideo(orgId, brandId, videoId, createPost()),
    ).rejects.toThrow('Source unavailable');
    expect(mockVideosInsert).not.toHaveBeenCalled();
  });

  describe('channel target settings', () => {
    const statusOf = () =>
      mockVideosInsert.mock.calls[0][0].requestBody.status as Record<
        string,
        unknown
      >;

    it('uploads the narrower audience when canonical visibility and provider settings disagree', async () => {
      const post = createPost({
        visibility: PostVisibility.UNLISTED,
      });

      await service.uploadVideo(orgId, brandId, videoId, post, {
        privacyStatus: 'private',
      });

      expect(statusOf()).toEqual({ privacyStatus: 'private' });
    });

    it('does not let a public canonical default widen an explicit private setting', async () => {
      const post = createPost({ visibility: PostVisibility.PUBLIC });

      await service.uploadVideo(orgId, brandId, videoId, post, {
        privacyStatus: 'private',
      });

      expect(statusOf()).toEqual({ privacyStatus: 'private' });
    });

    it('does not let stale public settings widen a private canonical choice', async () => {
      const post = createPost({ visibility: PostVisibility.PRIVATE });

      await service.uploadVideo(orgId, brandId, videoId, post, {
        privacyStatus: 'public',
      });

      expect(statusOf()).toEqual({ privacyStatus: 'private' });
    });

    it('does not let an unknown canonical visibility widen an explicit provider privacy', async () => {
      const post = createPost({ visibility: 'some-unknown-visibility' });

      await service.uploadVideo(orgId, brandId, videoId, post, {
        privacyStatus: 'unlisted',
      });

      expect(statusOf()).toEqual({ privacyStatus: 'unlisted' });
    });

    it('keeps an audience both fields already agree on', async () => {
      const post = createPost({ visibility: PostVisibility.UNLISTED });

      await service.uploadVideo(orgId, brandId, videoId, post, {
        privacyStatus: 'unlisted',
      });

      expect(statusOf()).toEqual({ privacyStatus: 'unlisted' });
    });

    it('drops the publish timer when provider privacy narrows a future public release', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      const post = createPost({
        scheduledDate: futureDate,
        status: PostStatus.SCHEDULED,
        visibility: PostVisibility.PUBLIC,
      });

      await service.uploadVideo(orgId, brandId, videoId, post, {
        privacyStatus: 'private',
      });

      expect(statusOf()).toEqual({ privacyStatus: 'private' });
    });

    it('drops the publish timer when a non-public privacy is requested', async () => {
      // `publishAt` always flips the video public at the scheduled time, so
      // honouring both would quietly override the composer's choice.
      const futureDate = new Date(Date.now() + 86400000);
      const post = createPost({
        scheduledDate: futureDate,
        status: PostStatus.SCHEDULED,
        visibility: PostVisibility.PRIVATE,
      });

      await service.uploadVideo(orgId, brandId, videoId, post);

      expect(statusOf()).toEqual({ privacyStatus: 'private' });
    });

    it('keeps the publish timer when the requested privacy is public', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      const post = createPost({
        scheduledDate: futureDate,
        status: PostStatus.SCHEDULED,
        visibility: PostVisibility.PUBLIC,
      });

      await service.uploadVideo(orgId, brandId, videoId, post);

      expect(statusOf()).toEqual({
        privacyStatus: PostStatus.PRIVATE,
        publishAt: futureDate.toISOString(),
      });
    });

    it('declares the made-for-kids audience when the setting is present', async () => {
      const post = createPost({ status: PostStatus.PUBLIC });

      await service.uploadVideo(orgId, brandId, videoId, post, {
        madeForKids: true,
      });

      expect(statusOf()).toEqual({
        privacyStatus: PostStatus.PUBLIC,
        selfDeclaredMadeForKids: true,
      });
    });

    it('omits the audience declaration when the setting is absent', async () => {
      // YouTube rejects `selfDeclaredMadeForKids: undefined` rather than
      // treating it as unset, so the field has to stay off the request.
      const post = createPost({ status: PostStatus.PUBLIC });

      await service.uploadVideo(orgId, brandId, videoId, post);

      expect(statusOf()).not.toHaveProperty('selfDeclaredMadeForKids');
    });

    it('adds the uploaded video to the requested playlist', async () => {
      const post = createPost();

      await service.uploadVideo(orgId, brandId, videoId, post, {
        playlistId: 'PL123',
      });

      expect(mockPlaylistItemsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: {
            snippet: {
              playlistId: 'PL123',
              resourceId: { kind: 'youtube#video', videoId: 'yt-uploaded-123' },
            },
          },
        }),
      );
    });

    it('does not touch playlists when no playlist was chosen', async () => {
      const post = createPost();

      await service.uploadVideo(orgId, brandId, videoId, post);

      expect(mockPlaylistItemsInsert).not.toHaveBeenCalled();
    });

    it('still reports success when the playlist insert fails', async () => {
      // The video is already live at that point, so a playlist failure must not
      // report the publish itself as failed.
      mockPlaylistItemsInsert.mockRejectedValueOnce(new Error('no such list'));
      const post = createPost();

      const result = await service.uploadVideo(orgId, brandId, videoId, post, {
        playlistId: 'PL404',
      });

      expect(result).toBe('yt-uploaded-123');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  it('streams the authorized original without persisting a signed URL in a job', async () => {
    const key = 'ingredients/videos/random%2Fsource?.mp4';
    const readSources = vi
      .fn()
      .mockResolvedValue([{ id: videoId, category: 'VIDEO', s3Key: key }]);
    Object.defineProperty(service, 'configService', {
      value: { isAuthorizedMediaDeliveryEnabled: true },
    });
    const sourceUrl = 'https://api.test.com/media/original?grant=opaque';
    const issueServerPublish = vi
      .fn()
      .mockResolvedValue(new Map([[videoId, sourceUrl]]));
    Object.defineProperty(service, 'authorizedMediaUrls', {
      value: { readSources, issueServerPublish },
    });
    await service.uploadVideo(orgId, brandId, videoId, createPost());
    expect(readSources).toHaveBeenCalledWith(orgId, [videoId]);
    expect(issueServerPublish).toHaveBeenCalledWith(orgId, [videoId]);
    expect(httpService.get).toHaveBeenCalledWith(sourceUrl, {
      responseType: 'stream',
      signal: expect.any(AbortSignal),
      timeout: 30_000,
    });
    expect(fileQueueService.processFile).not.toHaveBeenCalled();
  });

  it('fails before downloading or publishing a missing enabled source', async () => {
    Object.defineProperty(service, 'configService', {
      value: { isAuthorizedMediaDeliveryEnabled: true },
    });
    Object.defineProperty(service, 'authorizedMediaUrls', {
      value: { readSources: vi.fn().mockResolvedValue([]) },
    });
    await expect(
      service.uploadVideo(orgId, brandId, videoId, createPost()),
    ).rejects.toThrow();
    expect(fileQueueService.processFile).not.toHaveBeenCalled();
    expect(httpService.get).not.toHaveBeenCalled();
    expect(mockVideosInsert).not.toHaveBeenCalled();
  });
});
