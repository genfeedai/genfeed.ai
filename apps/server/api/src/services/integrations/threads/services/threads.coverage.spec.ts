/**
 * threads.coverage.spec.ts
 *
 * Additive coverage spec — covers the methods and branches NOT exercised by
 * threads.service.spec.ts. Mirrors the exact mock-setup style of the existing
 * spec (Test.createTestingModule + vi.fn() providers).
 *
 * vi.mock hoists must appear BEFORE any imports that transitively reach the
 * mocked module. Vitest hoists vi.mock calls to the top of the file
 * automatically, so declaration order here is correct.
 */

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => `decrypted:${val}`) },
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn(() => 'testMethod') },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import {
  ThreadsContainerStatus,
  ThreadsMediaType,
  ThreadsService,
} from '@api/services/integrations/threads/services/threads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared credential fixture — mirrors the existing spec shape
// ---------------------------------------------------------------------------
const MOCK_CREDENTIAL = {
  id: 'credential-1',
  accessToken: 'enc-access-token',
  externalId: 'threads-user-1',
};

// ---------------------------------------------------------------------------
// Test module bootstrap (same pattern as the existing spec)
// ---------------------------------------------------------------------------
describe('ThreadsService (coverage)', () => {
  let service: ThreadsService;
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
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
    credentialsService = service[
      'credentialsService'
    ] as typeof credentialsService;
    httpService = service['httpService'] as typeof httpService;
    loggerService = service['loggerService'] as typeof loggerService;
  });

  // Helper — set the credential lookup to return MOCK_CREDENTIAL
  function mockCredentialFound() {
    credentialsService.findOne.mockResolvedValue(MOCK_CREDENTIAL);
  }

  // Helper — set the credential lookup to return null (not found)
  function mockCredentialMissing() {
    credentialsService.findOne.mockResolvedValue(null);
  }

  // ---------------------------------------------------------------------------
  // refreshToken
  // ---------------------------------------------------------------------------
  describe('refreshToken', () => {
    it('should throw when credential is not found', async () => {
      mockCredentialMissing();

      await expect(service.refreshToken('org-1', 'brand-1')).rejects.toThrow(
        'Threads credential not found',
      );
    });

    it('should patch isConnected=false and throw when accessToken is missing', async () => {
      credentialsService.findOne.mockResolvedValue({
        ...MOCK_CREDENTIAL,
        accessToken: null,
      });
      credentialsService.patch.mockResolvedValue({});

      await expect(service.refreshToken('org-1', 'brand-1')).rejects.toThrow(
        'Threads access token not found',
      );

      expect(credentialsService.patch).toHaveBeenCalledWith('credential-1', {
        isConnected: false,
      });
    });

    it('should refresh the token and patch credential on success', async () => {
      mockCredentialFound();
      const refreshData = { access_token: 'new-token', expires_in: 3600 };
      httpService.get.mockReturnValue(of({ data: refreshData }));
      credentialsService.patch.mockResolvedValue({
        ...MOCK_CREDENTIAL,
        accessToken: 'new-token',
      });

      const result = await service.refreshToken('org-1', 'brand-1');

      expect(credentialsService.patch).toHaveBeenCalledWith(
        'credential-1',
        expect.objectContaining({
          accessToken: 'new-token',
          isConnected: true,
        }),
      );
      expect(result).toMatchObject({ accessToken: 'new-token' });
    });

    it('should refresh token when expires_in is absent (no expiry patch)', async () => {
      mockCredentialFound();
      const refreshData = { access_token: 'new-token-no-exp' };
      httpService.get.mockReturnValue(of({ data: refreshData }));
      credentialsService.patch.mockResolvedValue({
        ...MOCK_CREDENTIAL,
        accessToken: 'new-token-no-exp',
      });

      await service.refreshToken('org-1', 'brand-1');

      // accessTokenExpiry should be undefined when expires_in is absent
      expect(credentialsService.patch).toHaveBeenCalledWith(
        'credential-1',
        expect.objectContaining({
          accessToken: 'new-token-no-exp',
          accessTokenExpiry: undefined,
          isConnected: true,
        }),
      );
    });

    it('should patch isConnected=false and rethrow on HTTP error', async () => {
      mockCredentialFound();
      const apiError = new Error('refresh API error');
      httpService.get.mockReturnValue(throwError(() => apiError));
      credentialsService.patch.mockResolvedValue({});

      await expect(service.refreshToken('org-1', 'brand-1')).rejects.toThrow(
        'refresh API error',
      );

      expect(credentialsService.patch).toHaveBeenCalledWith('credential-1', {
        isConnected: false,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // createTextContainer
  // ---------------------------------------------------------------------------
  describe('createTextContainer', () => {
    it('should throw when credential is not found', async () => {
      mockCredentialMissing();

      await expect(
        service.createTextContainer('org-1', 'brand-1', 'hello'),
      ).rejects.toThrow('Threads credential not found');
    });

    it('should create a text container without replyToId', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        of({ data: { id: 'container-text-1' } }),
      );

      const result = await service.createTextContainer(
        'org-1',
        'brand-1',
        'hello world',
      );

      expect(result).toEqual({ containerId: 'container-text-1' });
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/threads-user-1/threads'),
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            media_type: ThreadsMediaType.TEXT,
            text: 'hello world',
          }),
        }),
      );
      // replyToId branch must NOT set reply_to_id
      const callParams = httpService.post.mock.calls[0][2].params as Record<
        string,
        unknown
      >;
      expect(callParams).not.toHaveProperty('reply_to_id');
    });

    it('should create a text container with replyToId', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        of({ data: { id: 'container-text-reply' } }),
      );

      const result = await service.createTextContainer(
        'org-1',
        'brand-1',
        'reply text',
        'parent-thread-1',
      );

      expect(result).toEqual({ containerId: 'container-text-reply' });
      expect(httpService.post).toHaveBeenCalledWith(
        expect.anything(),
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            reply_to_id: 'parent-thread-1',
          }),
        }),
      );
    });

    it('should throw on HTTP error', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        throwError(() => new Error('network error')),
      );

      await expect(
        service.createTextContainer('org-1', 'brand-1', 'some text'),
      ).rejects.toThrow('network error');
    });
  });

  // ---------------------------------------------------------------------------
  // createImageContainer
  // ---------------------------------------------------------------------------
  describe('createImageContainer', () => {
    it('should throw when credential is not found', async () => {
      mockCredentialMissing();

      await expect(
        service.createImageContainer(
          'org-1',
          'brand-1',
          'https://example.com/img.jpg',
        ),
      ).rejects.toThrow('Threads credential not found');
    });

    it('should create an image container with no optional params', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        of({ data: { id: 'container-image-1' } }),
      );

      const result = await service.createImageContainer(
        'org-1',
        'brand-1',
        'https://example.com/img.jpg',
      );

      expect(result).toEqual({ containerId: 'container-image-1' });
      const callParams = httpService.post.mock.calls[0][2].params as Record<
        string,
        unknown
      >;
      expect(callParams).not.toHaveProperty('text');
      expect(callParams).not.toHaveProperty('reply_to_id');
      expect(callParams).not.toHaveProperty('alt_text');
      expect(callParams).not.toHaveProperty('is_carousel_item');
    });

    it('should create an image container with text, replyToId, altText, and isCarouselItem', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        of({ data: { id: 'container-image-full' } }),
      );

      const result = await service.createImageContainer(
        'org-1',
        'brand-1',
        'https://example.com/img.jpg',
        'Image caption',
        'reply-thread-1',
        { altText: 'A nice image', isCarouselItem: true },
      );

      expect(result).toEqual({ containerId: 'container-image-full' });
      expect(httpService.post).toHaveBeenCalledWith(
        expect.anything(),
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            alt_text: 'A nice image',
            image_url: 'https://example.com/img.jpg',
            is_carousel_item: true,
            media_type: ThreadsMediaType.IMAGE,
            reply_to_id: 'reply-thread-1',
            text: 'Image caption',
          }),
        }),
      );
    });

    it('should throw on HTTP error', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        throwError(() => new Error('image upload failed')),
      );

      await expect(
        service.createImageContainer(
          'org-1',
          'brand-1',
          'https://example.com/img.jpg',
        ),
      ).rejects.toThrow('image upload failed');
    });
  });

  // ---------------------------------------------------------------------------
  // createVideoContainer (error branch — success already covered by existing spec)
  // ---------------------------------------------------------------------------
  describe('createVideoContainer', () => {
    it('should throw when credential is not found', async () => {
      mockCredentialMissing();

      await expect(
        service.createVideoContainer(
          'org-1',
          'brand-1',
          'https://example.com/video.mp4',
        ),
      ).rejects.toThrow('Threads credential not found');
    });

    it('should create a video container with no optional params', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        of({ data: { id: 'container-video-bare' } }),
      );

      const result = await service.createVideoContainer(
        'org-1',
        'brand-1',
        'https://example.com/video.mp4',
      );

      expect(result).toEqual({ containerId: 'container-video-bare' });
      const callParams = httpService.post.mock.calls[0][2].params as Record<
        string,
        unknown
      >;
      expect(callParams).not.toHaveProperty('text');
      expect(callParams).not.toHaveProperty('reply_to_id');
      expect(callParams).not.toHaveProperty('alt_text');
      expect(callParams).not.toHaveProperty('is_carousel_item');
    });

    it('should throw on HTTP error', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        throwError(() => new Error('video upload failed')),
      );

      await expect(
        service.createVideoContainer(
          'org-1',
          'brand-1',
          'https://example.com/video.mp4',
        ),
      ).rejects.toThrow('video upload failed');
    });
  });

  // ---------------------------------------------------------------------------
  // createCarouselContainer (error: item count > 20, HTTP error)
  // ---------------------------------------------------------------------------
  describe('createCarouselContainer', () => {
    it('should throw when more than 20 items are provided', async () => {
      const tooMany = Array.from({ length: 21 }, (_, i) => `item-${i}`);

      await expect(
        service.createCarouselContainer('org-1', 'brand-1', tooMany),
      ).rejects.toThrow('between 2 and 20');
    });

    it('should create carousel without optional text/replyToId', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(of({ data: { id: 'carousel-bare' } }));

      const result = await service.createCarouselContainer('org-1', 'brand-1', [
        'item-a',
        'item-b',
      ]);

      expect(result).toEqual({ containerId: 'carousel-bare' });
      const callParams = httpService.post.mock.calls[0][2].params as Record<
        string,
        unknown
      >;
      expect(callParams).not.toHaveProperty('text');
      expect(callParams).not.toHaveProperty('reply_to_id');
    });

    it('should throw when credential is not found', async () => {
      mockCredentialMissing();

      await expect(
        service.createCarouselContainer('org-1', 'brand-1', ['a', 'b']),
      ).rejects.toThrow('Threads credential not found');
    });

    it('should throw on HTTP error', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        throwError(() => new Error('carousel API error')),
      );

      await expect(
        service.createCarouselContainer('org-1', 'brand-1', [
          'item-1',
          'item-2',
        ]),
      ).rejects.toThrow('carousel API error');
    });
  });

  // ---------------------------------------------------------------------------
  // publishContainer
  // ---------------------------------------------------------------------------
  describe('publishContainer', () => {
    it('should throw when credential is not found', async () => {
      mockCredentialMissing();

      await expect(
        service.publishContainer('org-1', 'brand-1', 'container-1'),
      ).rejects.toThrow('Threads credential not found');
    });

    it('should publish the container and return threadId', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        of({ data: { id: 'published-thread-1' } }),
      );

      const result = await service.publishContainer(
        'org-1',
        'brand-1',
        'container-1',
      );

      expect(result).toEqual({ threadId: 'published-thread-1' });
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/threads-user-1/threads_publish'),
        null,
        expect.objectContaining({
          params: expect.objectContaining({
            creation_id: 'container-1',
          }),
        }),
      );
    });

    it('should throw on HTTP error', async () => {
      mockCredentialFound();
      httpService.post.mockReturnValue(
        throwError(() => new Error('publish failed')),
      );

      await expect(
        service.publishContainer('org-1', 'brand-1', 'container-1'),
      ).rejects.toThrow('publish failed');
    });
  });

  // ---------------------------------------------------------------------------
  // getContainerStatus
  // ---------------------------------------------------------------------------
  describe('getContainerStatus', () => {
    it('should throw when credential is not found', async () => {
      mockCredentialMissing();

      await expect(
        service.getContainerStatus('org-1', 'brand-1', 'container-1'),
      ).rejects.toThrow('Threads credential not found');
    });

    it('should return status and errorMessage from the API', async () => {
      mockCredentialFound();
      httpService.get.mockReturnValue(
        of({
          data: {
            error_message: 'something went wrong',
            status: ThreadsContainerStatus.ERROR,
          },
        }),
      );

      const result = await service.getContainerStatus(
        'org-1',
        'brand-1',
        'container-1',
      );

      expect(result).toEqual({
        errorMessage: 'something went wrong',
        status: ThreadsContainerStatus.ERROR,
      });
    });

    it('should return status only when errorMessage is absent', async () => {
      mockCredentialFound();
      httpService.get.mockReturnValue(
        of({ data: { status: ThreadsContainerStatus.FINISHED } }),
      );

      const result = await service.getContainerStatus(
        'org-1',
        'brand-1',
        'container-1',
      );

      expect(result).toEqual({
        errorMessage: undefined,
        status: ThreadsContainerStatus.FINISHED,
      });
    });

    it('should throw on HTTP error', async () => {
      mockCredentialFound();
      httpService.get.mockReturnValue(
        throwError(() => new Error('status fetch failed')),
      );

      await expect(
        service.getContainerStatus('org-1', 'brand-1', 'container-1'),
      ).rejects.toThrow('status fetch failed');
    });
  });

  // ---------------------------------------------------------------------------
  // publishText — success path and credential-missing branch
  // ---------------------------------------------------------------------------
  describe('publishText', () => {
    it('should publish a text thread end-to-end', async () => {
      vi.spyOn(service, 'createTextContainer').mockResolvedValue({
        containerId: 'text-container-1',
      });
      vi.spyOn(service, 'publishContainer').mockResolvedValue({
        threadId: 'text-thread-1',
      });

      const result = await service.publishText(
        'org-1',
        'brand-1',
        'Hello Threads!',
      );

      expect(service.createTextContainer).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'Hello Threads!',
        undefined,
      );
      expect(service.publishContainer).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'text-container-1',
      );
      expect(result).toEqual({ threadId: 'text-thread-1' });
    });

    it('should pass replyToId through to createTextContainer', async () => {
      vi.spyOn(service, 'createTextContainer').mockResolvedValue({
        containerId: 'text-container-reply',
      });
      vi.spyOn(service, 'publishContainer').mockResolvedValue({
        threadId: 'text-thread-reply',
      });

      await service.publishText('org-1', 'brand-1', 'Reply post', 'parent-1');

      expect(service.createTextContainer).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'Reply post',
        'parent-1',
      );
    });

    it('should propagate errors from createTextContainer', async () => {
      vi.spyOn(service, 'createTextContainer').mockRejectedValue(
        new Error('container create failed'),
      );

      await expect(
        service.publishText('org-1', 'brand-1', 'text'),
      ).rejects.toThrow('container create failed');
    });
  });

  // ---------------------------------------------------------------------------
  // publishImage — success path
  // ---------------------------------------------------------------------------
  describe('publishImage', () => {
    it('should publish an image thread end-to-end', async () => {
      vi.spyOn(service, 'createImageContainer').mockResolvedValue({
        containerId: 'image-container-1',
      });
      vi.spyOn(service, 'publishContainer').mockResolvedValue({
        threadId: 'image-thread-1',
      });

      const result = await service.publishImage(
        'org-1',
        'brand-1',
        'https://example.com/img.jpg',
        'Optional caption',
        'reply-to-1',
      );

      expect(service.createImageContainer).toHaveBeenCalledWith(
        'org-1',
        'brand-1',
        'https://example.com/img.jpg',
        'Optional caption',
        'reply-to-1',
      );
      expect(result).toEqual({ threadId: 'image-thread-1' });
    });

    it('should publish an image thread without optional text', async () => {
      vi.spyOn(service, 'createImageContainer').mockResolvedValue({
        containerId: 'image-container-no-text',
      });
      vi.spyOn(service, 'publishContainer').mockResolvedValue({
        threadId: 'image-thread-no-text',
      });

      const result = await service.publishImage(
        'org-1',
        'brand-1',
        'https://example.com/img.jpg',
      );

      expect(result).toEqual({ threadId: 'image-thread-no-text' });
    });

    it('should propagate errors from createImageContainer', async () => {
      vi.spyOn(service, 'createImageContainer').mockRejectedValue(
        new Error('image upload error'),
      );

      await expect(
        service.publishImage(
          'org-1',
          'brand-1',
          'https://example.com/img.jpg',
          'caption',
        ),
      ).rejects.toThrow('image upload error');
    });
  });

  // ---------------------------------------------------------------------------
  // publishVideo — text > 500 error and error propagation
  // ---------------------------------------------------------------------------
  describe('publishVideo', () => {
    it('should throw when text exceeds 500 characters', async () => {
      await expect(
        service.publishVideo(
          'org-1',
          'brand-1',
          'https://example.com/video.mp4',
          'x'.repeat(501),
        ),
      ).rejects.toThrow('500 characters');
    });

    it('should propagate errors from createVideoContainer', async () => {
      vi.spyOn(service, 'createVideoContainer').mockRejectedValue(
        new Error('video container error'),
      );

      await expect(
        service.publishVideo(
          'org-1',
          'brand-1',
          'https://example.com/video.mp4',
        ),
      ).rejects.toThrow('video container error');
    });

    it('should throw when video container reaches ERROR status', async () => {
      vi.spyOn(service, 'createVideoContainer').mockResolvedValue({
        containerId: 'video-container-err',
      });
      vi.spyOn(service, 'getContainerStatus').mockResolvedValue({
        errorMessage: 'Processing failed',
        status: ThreadsContainerStatus.ERROR,
      });

      await expect(
        service.publishVideo(
          'org-1',
          'brand-1',
          'https://example.com/video.mp4',
        ),
      ).rejects.toThrow('Processing failed');
    });

    it('should throw when video container reaches EXPIRED status', async () => {
      vi.spyOn(service, 'createVideoContainer').mockResolvedValue({
        containerId: 'video-container-expired',
      });
      vi.spyOn(service, 'getContainerStatus').mockResolvedValue({
        status: ThreadsContainerStatus.EXPIRED,
      });

      await expect(
        service.publishVideo(
          'org-1',
          'brand-1',
          'https://example.com/video.mp4',
        ),
      ).rejects.toThrow(`Threads container ${ThreadsContainerStatus.EXPIRED}`);
    });
  });

  // ---------------------------------------------------------------------------
  // publishCarousel — text > 500 error + mediaItems count errors
  // ---------------------------------------------------------------------------
  describe('publishCarousel', () => {
    it('should throw when text exceeds 500 characters', async () => {
      await expect(
        service.publishCarousel(
          'org-1',
          'brand-1',
          [
            {
              mediaType: ThreadsMediaType.IMAGE,
              url: 'https://example.com/a.jpg',
            },
            {
              mediaType: ThreadsMediaType.IMAGE,
              url: 'https://example.com/b.jpg',
            },
          ],
          'x'.repeat(501),
        ),
      ).rejects.toThrow('500 characters');
    });

    it('should throw when fewer than 2 media items are provided', async () => {
      await expect(
        service.publishCarousel('org-1', 'brand-1', [
          {
            mediaType: ThreadsMediaType.IMAGE,
            url: 'https://example.com/a.jpg',
          },
        ]),
      ).rejects.toThrow('between 2 and 20');
    });

    it('should throw when more than 20 media items are provided', async () => {
      const tooMany = Array.from({ length: 21 }, (_, i) => ({
        mediaType: ThreadsMediaType.IMAGE,
        url: `https://example.com/${i}.jpg`,
      }));

      await expect(
        service.publishCarousel('org-1', 'brand-1', tooMany),
      ).rejects.toThrow('between 2 and 20');
    });

    it('should propagate errors from createImageContainer during carousel assembly', async () => {
      vi.spyOn(service, 'createImageContainer').mockRejectedValue(
        new Error('image container error'),
      );

      await expect(
        service.publishCarousel('org-1', 'brand-1', [
          {
            mediaType: ThreadsMediaType.IMAGE,
            url: 'https://example.com/a.jpg',
          },
          {
            mediaType: ThreadsMediaType.IMAGE,
            url: 'https://example.com/b.jpg',
          },
        ]),
      ).rejects.toThrow('image container error');
    });
  });

  // ---------------------------------------------------------------------------
  // getThreadInsights
  // ---------------------------------------------------------------------------
  describe('getThreadInsights', () => {
    it('should throw when credential is not found', async () => {
      mockCredentialMissing();

      await expect(
        service.getThreadInsights('org-1', 'brand-1', 'thread-1'),
      ).rejects.toThrow('Threads credential not found');
    });

    it('should return all zero metrics when data is empty', async () => {
      mockCredentialFound();
      httpService.get.mockReturnValue(of({ data: { data: [] } }));

      const result = await service.getThreadInsights(
        'org-1',
        'brand-1',
        'thread-1',
      );

      expect(result).toEqual({
        likes: 0,
        quotes: 0,
        replies: 0,
        reposts: 0,
        views: 0,
      });
    });

    it('should return all zero metrics when data property is absent', async () => {
      mockCredentialFound();
      httpService.get.mockReturnValue(of({ data: {} }));

      const result = await service.getThreadInsights(
        'org-1',
        'brand-1',
        'thread-1',
      );

      expect(result).toEqual({
        likes: 0,
        quotes: 0,
        replies: 0,
        reposts: 0,
        views: 0,
      });
    });

    it('should correctly parse metric values from the API response', async () => {
      mockCredentialFound();
      const apiData = {
        data: [
          { name: 'views', values: [{ value: 1000 }] },
          { name: 'likes', values: [{ value: 50 }] },
          { name: 'replies', values: [{ value: 5 }] },
          { name: 'reposts', values: [{ value: 10 }] },
          { name: 'quotes', values: [{ value: 3 }] },
        ],
      };
      httpService.get.mockReturnValue(of({ data: apiData }));

      const result = await service.getThreadInsights(
        'org-1',
        'brand-1',
        'thread-1',
      );

      expect(result).toEqual({
        likes: 50,
        quotes: 3,
        replies: 5,
        reposts: 10,
        views: 1000,
      });
    });

    it('should accept a credentialId override', async () => {
      // findOne is called with a _id-based filter when credentialId is provided
      credentialsService.findOne.mockResolvedValue(MOCK_CREDENTIAL);
      httpService.get.mockReturnValue(of({ data: { data: [] } }));

      await service.getThreadInsights(
        'org-1',
        'brand-1',
        'thread-1',
        'cred-override',
      );

      expect(credentialsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'cred-override' }),
      );
    });

    it('should throw on HTTP error', async () => {
      mockCredentialFound();
      httpService.get.mockReturnValue(
        throwError(() => new Error('insights fetch failed')),
      );

      await expect(
        service.getThreadInsights('org-1', 'brand-1', 'thread-1'),
      ).rejects.toThrow('insights fetch failed');
    });
  });

  // ---------------------------------------------------------------------------
  // getCredential (private) — exercised via createTextContainer
  // Missing-accessToken branch not reachable via createTextContainer because the
  // private method throws synchronously; test via a thin path.
  // ---------------------------------------------------------------------------
  describe('getCredential — missing accessToken branch', () => {
    it('should throw when credential exists but has no accessToken', async () => {
      credentialsService.findOne.mockResolvedValue({
        ...MOCK_CREDENTIAL,
        accessToken: null,
      });

      // getCredential itself throws when !credential.accessToken
      await expect(
        service.createTextContainer('org-1', 'brand-1', 'test'),
      ).rejects.toThrow('Threads access token not found');
    });

    it('should throw when credential exists but has no externalId', async () => {
      credentialsService.findOne.mockResolvedValue({
        ...MOCK_CREDENTIAL,
        externalId: null,
      });

      await expect(
        service.createTextContainer('org-1', 'brand-1', 'test'),
      ).rejects.toThrow('Threads externalId is required');
    });
  });

  // ---------------------------------------------------------------------------
  // waitForContainerReady (private) — exercised via publishVideo spy teardown
  // Timeout path: maxAttempts exceeded without a terminal status
  // ---------------------------------------------------------------------------
  describe('waitForContainerReady — timeout path', () => {
    it('should throw timeout error when container stays IN_PROGRESS for all attempts', async () => {
      // Call waitForContainerReady indirectly through publishVideo,
      // stubbing createVideoContainer and getContainerStatus to keep returning IN_PROGRESS.
      // We override the private method's maxAttempts by calling waitForContainerReady via
      // publishVideo. To keep the test fast we spy on getContainerStatus.
      vi.spyOn(service, 'createVideoContainer').mockResolvedValue({
        containerId: 'video-timeout',
      });

      // Stub getContainerStatus to always return IN_PROGRESS so the loop exhausts.
      // waitForContainerReady default maxAttempts=30 — we patch the private method
      // by replacing it on the instance so the loop runs only 1 iteration.
      const originalWait = (service as unknown as Record<string, unknown>)
        .waitForContainerReady as (
        orgId: string,
        brandId: string,
        containerId: string,
        maxAttempts?: number,
        delayMs?: number,
      ) => Promise<void>;

      (service as unknown as Record<string, unknown>).waitForContainerReady =
        async (orgId: string, brandId: string, containerId: string) => {
          return originalWait.call(service, orgId, brandId, containerId, 1, 0);
        };

      vi.spyOn(service, 'getContainerStatus').mockResolvedValue({
        status: ThreadsContainerStatus.IN_PROGRESS,
      });

      await expect(
        service.publishVideo(
          'org-1',
          'brand-1',
          'https://example.com/video.mp4',
        ),
      ).rejects.toThrow('Threads media processing timeout');
    });
  });
});
