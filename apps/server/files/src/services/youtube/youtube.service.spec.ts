import { ConfigService } from '@files/config/config.service';
import { YoutubeService } from '@files/services/youtube/youtube.service';
import { PostStatus } from '@genfeedai/enums';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Mock, Mocked } from 'vitest';

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
        setCredentials: vi.fn(),
      })),
    },
    youtube: vi.fn().mockReturnValue({
      videos: {
        insert: vi.fn(),
      },
    }),
  },
}));

// Mock axios
vi.mock('axios', () => ({
  get: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  rmdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import * as fs from 'node:fs';
import axios from 'axios';
import { google } from 'googleapis';

describe('YoutubeService', () => {
  let service: YoutubeService;
  let mockConfigService: Mocked<ConfigService>;
  let mockYoutubeAPI: any;
  let mockOAuth2Client: any;

  const mockCredential = {
    accessToken: 'test-access-token',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost/callback',
    refreshToken: 'test-refresh-token',
  };

  const mockUploadParams = {
    credential: mockCredential,
    description: 'Test video description',
    ingredientId: 'ingredient-123',
    status: PostStatus.PUBLIC,
    tags: ['test', 'video'],
    title: 'Test Video Title',
  };

  beforeEach(async () => {
    // Reset mocks
    mockOAuth2Client = {
      on: vi.fn(),
      setCredentials: vi.fn(),
    };

    mockYoutubeAPI = {
      videos: {
        insert: vi.fn().mockResolvedValue({
          data: { id: 'youtube-video-id-123' },
        }),
      },
    };

    (google.auth.OAuth2 as Mock).mockImplementation(() => mockOAuth2Client);
    (google.youtube as Mock).mockReturnValue(mockYoutubeAPI);

    mockConfigService = {
      ingredientsEndpoint: 'https://api.example.com/ingredients',
    } as unknown as Mocked<ConfigService>;

    // Mock fs functions
    (fs.existsSync as Mock).mockReturnValue(false);
    (fs.mkdirSync as Mock).mockImplementation(() => {
      /* noop */
    });
    (fs.createWriteStream as Mock).mockReturnValue({
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'finish') {
          setTimeout(callback, 0);
        }
        return this;
      }),
    });
    (fs.createReadStream as Mock).mockReturnValue('mock-read-stream');
    (fs.unlinkSync as Mock).mockImplementation(() => {
      /* noop */
    });
    (fs.readdirSync as Mock).mockReturnValue([]);
    (fs.rmdirSync as Mock).mockImplementation(() => {
      /* noop */
    });

    // Mock axios
    const mockPipe = vi.fn();
    (axios.get as Mock).mockResolvedValue({
      data: {
        pipe: mockPipe,
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YoutubeService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<YoutubeService>(YoutubeService);

    vi.clearAllMocks();

    // Re-setup mocks after clearAllMocks
    (google.auth.OAuth2 as Mock).mockImplementation(() => mockOAuth2Client);
    (google.youtube as Mock).mockReturnValue(mockYoutubeAPI);
    (fs.existsSync as Mock).mockReturnValue(false);
    (fs.readdirSync as Mock).mockReturnValue([]);
    mockYoutubeAPI.videos.insert.mockResolvedValue({
      data: { id: 'youtube-video-id-123' },
    });
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('uploadVideo', () => {
    beforeEach(() => {
      // Mock the write stream to properly resolve
      const mockWriter = {
        on: vi.fn().mockImplementation(function (
          this: any,
          event: string,
          callback: () => void,
        ) {
          if (event === 'finish') {
            setTimeout(callback, 0);
          }
          return this;
        }),
      };
      (fs.createWriteStream as Mock).mockReturnValue(mockWriter);

      const mockDataStream = {
        pipe: vi.fn().mockReturnValue(mockWriter),
      };
      (axios.get as Mock).mockResolvedValue({
        data: mockDataStream,
      });
    });

    it('should initialize OAuth2 client with credentials', async () => {
      await service.uploadVideo(mockUploadParams);

      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        mockCredential.clientId,
        mockCredential.clientSecret,
        mockCredential.redirectUri,
      );

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: mockCredential.accessToken,
        refresh_token: mockCredential.refreshToken,
      });
    });

    it('should register token refresh handler', async () => {
      await service.uploadVideo(mockUploadParams);

      expect(mockOAuth2Client.on).toHaveBeenCalledWith(
        'tokens',
        expect.any(Function),
      );
    });

    it('should download video from ingredients endpoint', async () => {
      await service.uploadVideo(mockUploadParams);

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.example.com/ingredients/videos/ingredient-123',
        { responseType: 'stream' },
      );
    });

    it('should create output directory if it does not exist', async () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      await service.uploadVideo(mockUploadParams);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('youtube'),
        { recursive: true },
      );
    });

    it('should upload video with PUBLIC privacy status', async () => {
      await service.uploadVideo({
        ...mockUploadParams,
        status: PostStatus.PUBLIC,
      });

      expect(mockYoutubeAPI.videos.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            status: { privacyStatus: 'public' },
          }),
        }),
      );
    });

    it('should upload video with PRIVATE privacy status', async () => {
      await service.uploadVideo({
        ...mockUploadParams,
        status: PostStatus.PRIVATE,
      });

      expect(mockYoutubeAPI.videos.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            status: { privacyStatus: 'private' },
          }),
        }),
      );
    });

    it('should upload video with UNLISTED privacy status', async () => {
      await service.uploadVideo({
        ...mockUploadParams,
        status: PostStatus.UNLISTED,
      });

      expect(mockYoutubeAPI.videos.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            status: { privacyStatus: 'unlisted' },
          }),
        }),
      );
    });

    it('should schedule video for future publication', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow

      await service.uploadVideo({
        ...mockUploadParams,
        scheduledDate: futureDate,
      });

      expect(mockYoutubeAPI.videos.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            status: {
              privacyStatus: 'private',
              publishAt: futureDate.toISOString(),
            },
          }),
        }),
      );
    });

    it('should use public status for SCHEDULED with past date', async () => {
      const pastDate = new Date(Date.now() - 86400000); // Yesterday

      await service.uploadVideo({
        ...mockUploadParams,
        scheduledDate: pastDate,
        status: PostStatus.SCHEDULED,
      });

      expect(mockYoutubeAPI.videos.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            status: { privacyStatus: 'public' },
          }),
        }),
      );
    });

    it('should default to private for unknown status', async () => {
      await service.uploadVideo({
        ...mockUploadParams,
        status: 'unknown-status' as any,
      });

      expect(mockYoutubeAPI.videos.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            status: { privacyStatus: 'private' },
          }),
        }),
      );
    });

    it('should include video metadata in upload', async () => {
      await service.uploadVideo(mockUploadParams);

      expect(mockYoutubeAPI.videos.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          part: ['snippet', 'status'],
          requestBody: expect.objectContaining({
            snippet: {
              description: 'Test video description',
              tags: ['test', 'video'],
              title: 'Test Video Title',
            },
          }),
        }),
      );
    });

    it('should use default title if not provided', async () => {
      await service.uploadVideo({
        ...mockUploadParams,
        title: '',
      });

      expect(mockYoutubeAPI.videos.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            snippet: expect.objectContaining({
              title: 'Genfeed.ai Video',
            }),
          }),
        }),
      );
    });

    it('should return YouTube video ID on success', async () => {
      const result = await service.uploadVideo(mockUploadParams);

      expect(result).toBe('youtube-video-id-123');
    });

    it('should clean up local file after upload', async () => {
      (fs.existsSync as Mock)
        .mockReturnValueOnce(false) // Directory check
        .mockReturnValueOnce(true) // File cleanup check
        .mockReturnValueOnce(true); // Directory cleanup check

      await service.uploadVideo(mockUploadParams);

      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should remove empty directory after cleanup', async () => {
      (fs.existsSync as Mock)
        .mockReturnValueOnce(false) // Directory creation
        .mockReturnValueOnce(true) // File cleanup
        .mockReturnValueOnce(true); // Directory cleanup
      (fs.readdirSync as Mock).mockReturnValue([]);

      await service.uploadVideo(mockUploadParams);

      expect(fs.rmdirSync).toHaveBeenCalled();
    });

    it('should throw error if upload fails without video ID', async () => {
      mockYoutubeAPI.videos.insert.mockResolvedValue({
        data: { id: undefined },
      });

      await expect(service.uploadVideo(mockUploadParams)).rejects.toThrow(
        'Failed to upload video to YouTube',
      );
    });

    it('should throw error on API failure', async () => {
      const apiError = new Error('YouTube API error');
      mockYoutubeAPI.videos.insert.mockRejectedValue(apiError);

      await expect(service.uploadVideo(mockUploadParams)).rejects.toThrow(
        'YouTube API error',
      );
    });

    it('should throw error on download failure', async () => {
      (axios.get as Mock).mockRejectedValue(new Error('Download failed'));

      await expect(service.uploadVideo(mockUploadParams)).rejects.toThrow(
        'Download failed',
      );
    });

    it('should handle empty tags array', async () => {
      await service.uploadVideo({
        ...mockUploadParams,
        tags: [],
      });

      expect(mockYoutubeAPI.videos.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            snippet: expect.objectContaining({
              tags: [],
            }),
          }),
        }),
      );
    });
  });
});
