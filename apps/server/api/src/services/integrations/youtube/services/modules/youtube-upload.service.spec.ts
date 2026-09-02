import fs from 'node:fs';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeUploadService } from '@api/services/integrations/youtube/services/modules/youtube-upload.service';
import { TagResolutionService } from '@api/shared/services/tag-resolution/tag-resolution.service';
import { PostStatus, PostVisibility } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock googleapis
const mockVideosInsert = vi.fn();
const mockPlaylistItemsInsert = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    youtube: () => ({
      playlistItems: { insert: mockPlaylistItemsInsert },
      videos: { insert: mockVideosInsert },
    }),
  },
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  createReadStream: vi.fn().mockReturnValue('mock-read-stream'),
  default: {
    createReadStream: vi.fn().mockReturnValue('mock-read-stream'),
    unlinkSync: vi.fn(),
  },
  unlinkSync: vi.fn(),
}));

// Mock htmlToText
vi.mock('@api/shared/utils/html-to-text/html-to-text.util', () => ({
  htmlToText: vi.fn((html: string) => html || ''),
}));

describe('YoutubeUploadService', () => {
  let service: YoutubeUploadService;
  let fileQueueService: {
    processFile: ReturnType<typeof vi.fn>;
    waitForJob: ReturnType<typeof vi.fn>;
  };
  let tagResolutionService: { resolveTagLabels: ReturnType<typeof vi.fn> };
  let authService: { refreshToken: ReturnType<typeof vi.fn> };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
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

    fileQueueService = {
      processFile: vi.fn().mockResolvedValue({ jobId: 'job-123' }),
      waitForJob: vi
        .fn()
        .mockResolvedValue({ outputPath: '/tmp/test-video.mp4' }),
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
    };

    mockVideosInsert.mockResolvedValue({ data: { id: 'yt-uploaded-123' } });
    mockPlaylistItemsInsert.mockResolvedValue({ data: { id: 'playlist-1' } });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeUploadService,
        { provide: FileQueueService, useValue: fileQueueService },
        { provide: TagResolutionService, useValue: tagResolutionService },
        { provide: YoutubeAuthService, useValue: authService },
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
    expect(fileQueueService.processFile).toHaveBeenCalled();
    expect(fileQueueService.waitForJob).toHaveBeenCalledWith('job-123', 30_000);
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

  it('should delete the local file after successful upload', async () => {
    const post = createPost();

    await service.uploadVideo(orgId, brandId, videoId, post);

    expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/test-video.mp4');
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
  });

  it('should handle empty tags array', async () => {
    const post = createPost({ tags: [] });

    await service.uploadVideo(orgId, brandId, videoId, post);

    expect(tagResolutionService.resolveTagLabels).toHaveBeenCalledWith([]);
  });

  it('should use fallback file path when waitForJob returns no outputPath', async () => {
    fileQueueService.waitForJob.mockResolvedValueOnce({});
    const post = createPost();

    await service.uploadVideo(orgId, brandId, videoId, post);

    // Should use fallback path constructed from videoId
    expect(fs.createReadStream).toHaveBeenCalled();
  });

  describe('channel target settings', () => {
    const statusOf = () =>
      mockVideosInsert.mock.calls[0][0].requestBody.status as Record<
        string,
        unknown
      >;

    it('uses canonical visibility over provider settings', async () => {
      const post = createPost({
        visibility: PostVisibility.UNLISTED,
      });

      await service.uploadVideo(orgId, brandId, videoId, post, {
        privacyStatus: 'private',
      });

      expect(statusOf()).toEqual({ privacyStatus: 'unlisted' });
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
});
