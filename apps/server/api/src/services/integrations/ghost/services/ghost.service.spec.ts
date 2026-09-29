vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((v: string) => `dec:${v}`) },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
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
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    resolveBrandAccount: ReturnType<typeof vi.fn>;
  };
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
    credentialsService = {
      findOne: vi.fn(),
      // Multi-account resolution routes through `resolveBrandAccount`; the double
      // answers with whatever `findOne` is primed to return so the existing
      // single-account cases keep describing one connected account.
      resolveBrandAccount: vi.fn((options: { credentialId?: string | null }) =>
        (credentialsService.findOne as vi.Mock)(options),
      ),
    };
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

  describe('generateToken', () => {
    it('should throw for API key with empty id', () => {
      expect(() => service.generateToken(':secret')).toThrow(
        'Invalid Ghost Admin API key format',
      );
    });
  });

  describe('createPost', () => {
    const ghostUrl = 'https://myblog.ghost.io';
    const apiKey = 'keyid:keysecret0123456789abcdef';

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
  });

  describe('getSiteInfo', () => {
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
        externalId: 'https://myblog.ghost.io',
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
          brandId,
          organizationId: orgId,
          platform: CredentialPlatform.GHOST,
        }),
      );
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
