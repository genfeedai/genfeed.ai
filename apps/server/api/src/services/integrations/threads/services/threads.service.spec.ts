import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  ThreadsContainerStatus,
  ThreadsMediaType,
  ThreadsService,
} from '@api/services/integrations/threads/services/threads.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('ThreadsService', () => {
  let service: ThreadsService;

  const mockCredential = {
    accessToken: 'threads-token',
    externalId: 'threads-user-1',
    _id: 'credential-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThreadsService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('') },
        },
        {
          provide: CredentialsService,
          useValue: { findOne: vi.fn(), patch: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<ThreadsService>(ThreadsService);
  });

  function mockCredentialLookup() {
    const mockCredentialsService = service['credentialsService'];
    (
      mockCredentialsService.findOne as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockCredential);
  }

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAccountDetails', () => {
    it('should call the Threads Graph API with access token', async () => {
      const mockResponse = { data: { id: '123', username: 'testuser' } };
      const mockHttpService = service['httpService'];
      (mockHttpService.get as ReturnType<typeof vi.fn>).mockReturnValue({
        pipe: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
        [Symbol.observable]: vi.fn(),
        toPromise: vi.fn().mockResolvedValue(mockResponse),
      });

      // Since firstValueFrom is used, we need to mock the observable properly
      (mockHttpService.get as ReturnType<typeof vi.fn>).mockReturnValue(
        of(mockResponse),
      );

      const result = await service.getAccountDetails('test-token');

      expect(result).toEqual(mockResponse.data);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/me'),
        expect.objectContaining({
          params: expect.objectContaining({
            access_token: 'test-token',
          }),
        }),
      );
    });

    it('should throw and log error when API call fails', async () => {
      const mockHttpService = service['httpService'];
      const { throwError } = await import('rxjs');
      const error = new Error('API error');
      (mockHttpService.get as ReturnType<typeof vi.fn>).mockReturnValue(
        throwError(() => error),
      );

      await expect(service.getAccountDetails('test-token')).rejects.toThrow(
        'API error',
      );
    });
  });

  describe('getTrends', () => {
    it('should return mock trend data for Threads', () => {
      const trends = service.getTrends();

      expect(Array.isArray(trends)).toBe(true);
      expect(trends.length).toBe(5);
      expect(trends[0]).toEqual(
        expect.objectContaining({
          platform: 'threads',
          topic: 'AI',
        }),
      );
    });
  });

  describe('publishText', () => {
    it('should throw error when text exceeds 500 characters', async () => {
      const longText = 'a'.repeat(501);

      await expect(
        service.publishText('org-1', 'brand-1', longText),
      ).rejects.toThrow('500 characters');
    });
  });

  describe('publishImage', () => {
    it('should throw error when text exceeds 500 characters', async () => {
      const longText = 'a'.repeat(501);

      await expect(
        service.publishImage(
          'org-1',
          'brand-1',
          'https://example.com/img.png',
          longText,
        ),
      ).rejects.toThrow('500 characters');
    });
  });

  describe('createVideoContainer', () => {
    it('should create a video container with reply and carousel metadata', async () => {
      mockCredentialLookup();
      const mockHttpService = service['httpService'];
      (mockHttpService.post as ReturnType<typeof vi.fn>).mockReturnValue(
        of({ data: { id: 'container-video-1' } }),
      );

      const result = await service.createVideoContainer(
        'org-1',
        'brand-1',
        'https://example.com/video.mp4',
        'Video caption',
        'reply-1',
        { altText: 'Demo video', isCarouselItem: true },
      );

      expect(result).toEqual({ containerId: 'container-video-1' });
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/threads-user-1/threads'),
        null,
        {
          params: expect.objectContaining({
            access_token: 'threads-token',
            alt_text: 'Demo video',
            is_carousel_item: true,
            media_type: ThreadsMediaType.VIDEO,
            reply_to_id: 'reply-1',
            text: 'Video caption',
            video_url: 'https://example.com/video.mp4',
          }),
        },
      );
    });
  });

  describe('createCarouselContainer', () => {
    it('should create a carousel container from child container IDs', async () => {
      mockCredentialLookup();
      const mockHttpService = service['httpService'];
      (mockHttpService.post as ReturnType<typeof vi.fn>).mockReturnValue(
        of({ data: { id: 'container-carousel-1' } }),
      );

      const result = await service.createCarouselContainer(
        'org-1',
        'brand-1',
        ['item-1', 'item-2'],
        'Carousel caption',
        'reply-1',
      );

      expect(result).toEqual({ containerId: 'container-carousel-1' });
      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/threads-user-1/threads'),
        null,
        {
          params: expect.objectContaining({
            access_token: 'threads-token',
            children: 'item-1,item-2',
            media_type: ThreadsMediaType.CAROUSEL,
            reply_to_id: 'reply-1',
            text: 'Carousel caption',
          }),
        },
      );
    });

    it('should reject carousels outside the Threads media count range', async () => {
      await expect(
        service.createCarouselContainer('org-1', 'brand-1', ['item-1']),
      ).rejects.toThrow('between 2 and 20');
    });
  });

  describe('publishVideo', () => {
    it('should wait for video processing before publishing', async () => {
      vi.spyOn(service, 'createVideoContainer').mockResolvedValue({
        containerId: 'container-video-1',
      });
      vi.spyOn(service, 'getContainerStatus').mockResolvedValue({
        status: ThreadsContainerStatus.FINISHED,
      });
      vi.spyOn(service, 'publishContainer').mockResolvedValue({
        threadId: 'thread-video-1',
      });

      const result = await service.publishVideo(
        'org-1',
        'brand-1',
        'https://example.com/video.mp4',
        'Video caption',
      );

      expect(service.getContainerStatus).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'container-video-1',
      );
      expect(service.publishContainer).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'container-video-1',
      );
      expect(result).toEqual({ threadId: 'thread-video-1' });
    });
  });

  describe('publishCarousel', () => {
    it('should create media item containers and publish the carousel', async () => {
      vi.spyOn(service, 'createImageContainer').mockResolvedValueOnce({
        containerId: 'item-image-1',
      });
      vi.spyOn(service, 'createVideoContainer').mockResolvedValueOnce({
        containerId: 'item-video-1',
      });
      vi.spyOn(service, 'getContainerStatus').mockResolvedValue({
        status: ThreadsContainerStatus.FINISHED,
      });
      vi.spyOn(service, 'createCarouselContainer').mockResolvedValue({
        containerId: 'container-carousel-1',
      });
      vi.spyOn(service, 'publishContainer').mockResolvedValue({
        threadId: 'thread-carousel-1',
      });

      const result = await service.publishCarousel(
        'org-1',
        'brand-1',
        [
          {
            mediaType: ThreadsMediaType.IMAGE,
            url: 'https://example.com/image.jpg',
          },
          {
            mediaType: ThreadsMediaType.VIDEO,
            url: 'https://example.com/video.mp4',
          },
        ],
        'Carousel caption',
        'reply-1',
      );

      expect(service.createImageContainer).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'https://example.com/image.jpg',
        undefined,
        undefined,
        { altText: undefined, isCarouselItem: true },
      );
      expect(service.createVideoContainer).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'https://example.com/video.mp4',
        undefined,
        undefined,
        { altText: undefined, isCarouselItem: true },
      );
      expect(service.createCarouselContainer).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        ['item-image-1', 'item-video-1'],
        'Carousel caption',
        'reply-1',
      );
      expect(result).toEqual({ threadId: 'thread-carousel-1' });
    });
  });
});
