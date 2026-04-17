import fs from 'node:fs';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeUploadService } from '@api/services/integrations/youtube/services/modules/youtube-upload.service';
import { TagResolutionService } from '@api/shared/services/tag-resolution/tag-resolution.service';
import { PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock googleapis
const mockVideosInsert = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    youtube: () => ({
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
  const orgId = new Types.ObjectId().toHexString();
  const brandId = new Types.ObjectId().toHexString();
  const videoId = new Types.ObjectId().toHexString();

  function createPost(
    overrides: Partial<PostEntity> & { status?: PostStatus | string } = {},
  ): PostEntity {
    const fixture = {
      _id: new Types.ObjectId(),
      description: '<p>Test description</p>',
      label: 'Test Video',
      scheduledDate: null,
      status: PostStatus.PUBLIC,
      tags: [new Types.ObjectId()],
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
    expect(authService.refreshToken).toHaveBeenCalledWith(orgId, brandId);
    expect(fileQueueService.processFile).toHaveBeenCalled();
    expect(fileQueueService.waitForJob).toHaveBeenCalledWith('job-123', 30_000);
    expect(mockVideosInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: mockAuth,
        part: ['snippet', 'status'],
      }),
    );
  });

  it('should resolve tag labels for the post tags', async () => {
    const tags = [new Types.ObjectId(), new Types.ObjectId()];
    const post = createPost({ tags });

    await service.uploadVideo(orgId, brandId, videoId, post);

    expect(tagResolutionService.resolveTagLabels).toHaveBeenCalledWith(tags);
  });

  it('should set privacy to PUBLIC for public posts', async () => {
    const post = createPost({ status: PostStatus.PUBLIC });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.status).toEqual({
      privacyStatus: PostStatus.PUBLIC,
    });
  });

  it('should set privacy to PRIVATE for private posts', async () => {
    const post = createPost({ status: PostStatus.PRIVATE });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.status).toEqual({
      privacyStatus: PostStatus.PRIVATE,
    });
  });

  it('should set privacy to UNLISTED for unlisted posts', async () => {
    const post = createPost({ status: PostStatus.UNLISTED });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.status).toEqual({
      privacyStatus: PostStatus.UNLISTED,
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

  it('should default to PRIVATE for unknown status', async () => {
    const post = createPost({ status: 'some-unknown-status' });

    await service.uploadVideo(orgId, brandId, videoId, post);

    const insertCall = mockVideosInsert.mock.calls[0][0];
    expect(insertCall.requestBody.status).toEqual({
      privacyStatus: PostStatus.PRIVATE,
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
});
