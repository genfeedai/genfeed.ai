vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((v: string) => `dec:${v}`) },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GhostService } from './ghost.service';

const makeAxiosResponse = <T>(data: T) => ({ data });

describe('GhostService', () => {
  let service: GhostService;
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id';
  const brandId = 'test-object-id';

  beforeEach(async () => {
    httpService = { get: vi.fn(), post: vi.fn() };
    credentialsService = { findOne: vi.fn() };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GhostService,
        { provide: HttpService, useValue: httpService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<GhostService>(GhostService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateToken', () => {
    it('should generate a JWT from a valid API key', () => {
      const token = service.generateToken('abc123:deadbeef0123456789abcdef');

      expect(token.split('.')).toHaveLength(3);
    });

    it('should throw for invalid API key format (no colon)', () => {
      expect(() => service.generateToken('invalid-key')).toThrow(
        'Invalid Ghost Admin API key format',
      );
    });

    it('should throw for API key with empty id', () => {
      expect(() => service.generateToken(':secret')).toThrow(
        'Invalid Ghost Admin API key format',
      );
    });

    it('should throw for API key with empty secret', () => {
      expect(() => service.generateToken('id:')).toThrow(
        'Invalid Ghost Admin API key format',
      );
    });
  });

  describe('createPost', () => {
    const ghostUrl = 'https://myblog.ghost.io';
    const apiKey = 'keyid:keysecret0123456789abcdef';

    it('should create a post and return the first post from the response', async () => {
      const mockPost = {
        id: 'ghost-post-1',
        url: 'https://myblog.ghost.io/post-1',
      };
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ posts: [mockPost] })),
      );

      const result = await service.createPost(
        ghostUrl,
        apiKey,
        'Test Title',
        '<p>Content</p>',
      );

      expect(result).toEqual(mockPost);
    });

    it('should default to draft status', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ posts: [{ id: '1' }] })),
      );

      await service.createPost(ghostUrl, apiKey, 'Title', '<p>Body</p>');

      const body = httpService.post.mock.calls[0][1] as {
        posts: Array<{ status: string }>;
      };
      expect(body.posts[0].status).toBe('draft');
    });

    it('should use published status when specified', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ posts: [{ id: '1' }] })),
      );

      await service.createPost(
        ghostUrl,
        apiKey,
        'Title',
        '<p>Body</p>',
        'published',
      );

      const body = httpService.post.mock.calls[0][1] as {
        posts: Array<{ status: string }>;
      };
      expect(body.posts[0].status).toBe('published');
    });

    it('should include feature image when provided', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ posts: [{ id: '1' }] })),
      );

      await service.createPost(
        ghostUrl,
        apiKey,
        'Title',
        '<p>Body</p>',
        'draft',
        'https://example.com/image.jpg',
      );

      const body = httpService.post.mock.calls[0][1] as {
        posts: Array<{ feature_image: string }>;
      };
      expect(body.posts[0].feature_image).toBe('https://example.com/image.jpg');
    });

    it('should include tags when provided', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ posts: [{ id: '1' }] })),
      );

      await service.createPost(
        ghostUrl,
        apiKey,
        'Title',
        '<p>Body</p>',
        'draft',
        undefined,
        ['news', 'tech'],
      );

      const body = httpService.post.mock.calls[0][1] as {
        posts: Array<{ tags: Array<{ name: string }> }>;
      };
      expect(body.posts[0].tags).toEqual([{ name: 'news' }, { name: 'tech' }]);
    });

    it('should set Authorization header with Ghost token', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ posts: [{ id: '1' }] })),
      );

      await service.createPost(ghostUrl, apiKey, 'Title', '<p>Body</p>');

      const headers = (
        httpService.post.mock.calls[0][2] as { headers: Record<string, string> }
      ).headers;
      expect(headers.Authorization).toMatch(/^Ghost [^.]+\.[^.]+\.[^.]+$/);
    });

    it('should call the correct API URL', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ posts: [{ id: '1' }] })),
      );

      await service.createPost(ghostUrl, apiKey, 'Title', '<p>Body</p>');

      expect(httpService.post).toHaveBeenCalledWith(
        'https://myblog.ghost.io/ghost/api/admin/posts/',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should log and rethrow on HTTP error', async () => {
      httpService.post.mockReturnValue(throwError(() => new Error('502')));

      await expect(
        service.createPost(ghostUrl, apiKey, 'Title', '<p>Body</p>'),
      ).rejects.toThrow('502');
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should normalize URL without protocol', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ posts: [{ id: '1' }] })),
      );

      await service.createPost(
        'myblog.ghost.io',
        apiKey,
        'Title',
        '<p>Body</p>',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        'https://myblog.ghost.io/ghost/api/admin/posts/',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should strip trailing slashes from URL', async () => {
      httpService.post.mockReturnValue(
        of(makeAxiosResponse({ posts: [{ id: '1' }] })),
      );

      await service.createPost(
        'https://myblog.ghost.io///',
        apiKey,
        'Title',
        '<p>Body</p>',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        'https://myblog.ghost.io/ghost/api/admin/posts/',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('getSiteInfo', () => {
    it('should return site info from the API', async () => {
      const mockSite = { title: 'My Blog', url: 'https://myblog.ghost.io' };
      httpService.get.mockReturnValue(
        of(makeAxiosResponse({ site: mockSite })),
      );

      const result = await service.getSiteInfo(
        'https://myblog.ghost.io',
        'keyid:keysecret0123456789abcdef',
      );

      expect(result).toEqual(mockSite);
    });

    it('should call the correct site API URL', async () => {
      httpService.get.mockReturnValue(
        of(makeAxiosResponse({ site: { title: 'Blog' } })),
      );

      await service.getSiteInfo(
        'https://myblog.ghost.io',
        'keyid:keysecret0123456789abcdef',
      );

      expect(httpService.get).toHaveBeenCalledWith(
        'https://myblog.ghost.io/ghost/api/admin/site/',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Ghost [^.]+\.[^.]+\.[^.]+$/),
          }),
        }),
      );
    });

    it('should log and rethrow on error', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('Not found')));

      await expect(
        service.getSiteInfo(
          'https://myblog.ghost.io',
          'keyid:keysecret0123456789abcdef',
        ),
      ).rejects.toThrow('Not found');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getCredentialApiKey', () => {
    it('should return decrypted API key and ghostUrl from credential', async () => {
      credentialsService.findOne.mockResolvedValue({
        accessToken: 'encrypted-token',
        externalHandle: 'https://myblog.ghost.io',
      });

      const result = await service.getCredentialApiKey(orgId, brandId);

      expect(result).toEqual({
        apiKey: 'dec:encrypted-token',
        ghostUrl: 'https://myblog.ghost.io',
      });
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted-token');
    });

    it('should query credentials with organization scope and isDeleted filter', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      await service.getCredentialApiKey(orgId, brandId);

      expect(credentialsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: expect.any(String),
          isDeleted: false,
          organization: expect.any(String),
          platform: CredentialPlatform.GHOST,
        }),
      );
    });

    it('should return null when no credential is found', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      const result = await service.getCredentialApiKey(orgId, brandId);

      expect(result).toBeNull();
    });

    it('should return null when credential has no accessToken', async () => {
      credentialsService.findOne.mockResolvedValue({
        accessToken: '',
        externalHandle: 'https://myblog.ghost.io',
      });

      const result = await service.getCredentialApiKey(orgId, brandId);

      expect(result).toBeNull();
    });

    it('should return null when credential has no externalHandle', async () => {
      credentialsService.findOne.mockResolvedValue({
        accessToken: 'encrypted-token',
        externalHandle: '',
      });

      const result = await service.getCredentialApiKey(orgId, brandId);

      expect(result).toBeNull();
    });

    it('should log and rethrow on error', async () => {
      credentialsService.findOne.mockRejectedValue(new Error('DB error'));

      await expect(service.getCredentialApiKey(orgId, brandId)).rejects.toThrow(
        'DB error',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
