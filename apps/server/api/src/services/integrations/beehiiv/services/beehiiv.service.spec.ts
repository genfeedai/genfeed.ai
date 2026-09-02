import type { Mock } from 'vitest';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((val: string) => `decrypted:${val}`),
    encrypt: vi.fn((val: string) => `encrypted:${val}`),
  },
}));

import { SERVER_TOKENS } from '@api/server.dependencies';
import { CredentialPlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { BeehiivService } from './beehiiv.service';

describe('BeehiivService', () => {
  let service: BeehiivService;
  let httpGetMock: ReturnType<typeof vi.fn>;
  let httpPostMock: ReturnType<typeof vi.fn>;
  let credentialsFindOneMock: ReturnType<typeof vi.fn>;
  let credentialsResolveMock: ReturnType<typeof vi.fn>;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const mockPublication = {
    created: 1_700_000_000,
    description: 'Test newsletter',
    id: 'pub_abc123',
    name: 'My Newsletter',
    url: 'https://newsletter.beehiiv.com',
  };

  const mockSubscriber = {
    created: 1_700_000_001,
    email: 'sub@example.com',
    id: 'sub_xyz789',
    status: 'active',
    utm_source: 'organic',
  };

  beforeEach(async () => {
    httpGetMock = vi.fn();
    httpPostMock = vi.fn();
    credentialsFindOneMock = vi.fn();
    // Multi-account resolution routes through `resolveBrandAccount`; the double
    // answers with whatever `findOne` is primed to return so the existing cases
    // keep describing one connected account.
    credentialsResolveMock = vi.fn(
      (options: { credentialId?: string | null }) =>
        (credentialsFindOneMock as Mock)(options),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeehiivService,
        {
          provide: LoggerService,
          useValue: loggerMock,
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(() => undefined),
          },
        },
        {
          provide: HttpService,
          useValue: {
            get: httpGetMock,
            post: httpPostMock,
          },
        },
        {
          provide: SERVER_TOKENS.credentials,
          useValue: {
            findOne: credentialsFindOneMock,
            resolveBrandAccount: credentialsResolveMock,
          },
        },
      ],
    }).compile();

    service = module.get<BeehiivService>(BeehiivService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listPublications', () => {
    it('should return a list of publications on success', async () => {
      httpGetMock.mockReturnValue(
        of({ data: { data: [mockPublication], total_results: 1 } }),
      );

      const result = await service.listPublications('test-api-key');

      expect(result).toEqual([mockPublication]);
      expect(httpGetMock).toHaveBeenCalledWith(
        'https://api.beehiiv.com/v2/publications',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-api-key' },
        }),
      );
    });

    it('should return empty array when data is null', async () => {
      httpGetMock.mockReturnValue(
        of({ data: { data: null, total_results: 0 } }),
      );

      const result = await service.listPublications('test-api-key');

      expect(result).toEqual([]);
    });

    it('should throw when HTTP request fails', async () => {
      httpGetMock.mockReturnValue(throwError(() => new Error('Network error')));

      await expect(service.listPublications('bad-key')).rejects.toMatchObject({
        code: 'transient_failure',
        isRetryable: true,
      });
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('getSubscribers', () => {
    it('should return subscribers response with pagination', async () => {
      const mockResponse = {
        data: [mockSubscriber],
        limit: 20,
        page: 1,
        total_results: 1,
      };
      httpGetMock.mockReturnValue(of({ data: mockResponse }));

      const result = await service.getSubscribers(
        'api-key',
        'pub_abc123',
        1,
        20,
      );

      expect(result).toEqual(mockResponse);
      expect(httpGetMock).toHaveBeenCalledWith(
        'https://api.beehiiv.com/v2/publications/pub_abc123/subscriptions',
        expect.objectContaining({
          headers: { Authorization: 'Bearer api-key' },
          params: { limit: '20', page: '1' },
        }),
      );
    });

    it('should omit pagination params when not provided', async () => {
      httpGetMock.mockReturnValue(of({ data: { data: [], total_results: 0 } }));

      await service.getSubscribers('api-key', 'pub_abc123');

      expect(httpGetMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: {} }),
      );
    });

    it('should throw when HTTP request fails', async () => {
      httpGetMock.mockReturnValue(
        throwError(() => ({ response: { status: 401 } })),
      );

      await expect(
        service.getSubscribers('bad-key', 'pub_abc123'),
      ).rejects.toMatchObject({
        code: 'authorization_failed',
        isRetryable: false,
        statusCode: 401,
      });
    });
  });

  describe('createSubscribers', () => {
    it('posts one subscription per address and includes utm_source', async () => {
      httpPostMock.mockReturnValue(of({ data: { data: mockSubscriber } }));

      const result = await service.createSubscribers(
        'api-key',
        'pub_abc123',
        ['sub@example.com'],
        'twitter',
      );

      expect(result).toEqual([
        expect.objectContaining({
          email: 'sub@example.com',
          subscriberId: mockSubscriber.id,
          success: true,
        }),
      ]);
      expect(httpPostMock).toHaveBeenCalledWith(
        'https://api.beehiiv.com/v2/publications/pub_abc123/subscriptions',
        { email: 'sub@example.com', utm_source: 'twitter' },
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer api-key' }),
        }),
      );
    });

    it('should not include utm_source when not provided', async () => {
      httpPostMock.mockReturnValue(of({ data: { data: mockSubscriber } }));

      await service.createSubscribers('api-key', 'pub_abc123', [
        'sub@example.com',
      ]);

      expect(httpPostMock).toHaveBeenCalledWith(
        expect.any(String),
        { email: 'sub@example.com' },
        expect.any(Object),
      );
    });

    it('returns a failed outcome instead of throwing when one address is rejected', async () => {
      httpPostMock.mockReturnValue(
        throwError(() => ({ response: { status: 409 } })),
      );

      const result = await service.createSubscribers('api-key', 'pub_abc123', [
        'dup@example.com',
      ]);

      expect(result).toEqual([
        expect.objectContaining({
          email: 'dup@example.com',
          errorCode: 'validation_failed',
          isRetryable: false,
          success: false,
        }),
      ]);
    });

    it('returns one normalized outcome per address', async () => {
      httpPostMock
        .mockReturnValueOnce(of({ data: { data: mockSubscriber } }))
        .mockReturnValueOnce(throwError(() => ({ response: { status: 422 } })));

      const result = await service.createSubscribers(
        'api-key',
        'pub_abc123',
        [' Sub@Example.com ', 'invalid@example.com'],
        'launch',
      );

      expect(httpPostMock).toHaveBeenNthCalledWith(
        1,
        'https://api.beehiiv.com/v2/publications/pub_abc123/subscriptions',
        { email: 'sub@example.com', utm_source: 'launch' },
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer api-key' }),
        }),
      );
      expect(result).toEqual([
        expect.objectContaining({
          email: 'sub@example.com',
          subscriberId: mockSubscriber.id,
          success: true,
        }),
        expect.objectContaining({
          email: 'invalid@example.com',
          errorCode: 'validation_failed',
          isRetryable: false,
          success: false,
        }),
      ]);
    });
  });

  describe('createPost', () => {
    it('creates a post with explicit draft status', async () => {
      const mockPost = {
        content_html: '<p>Hello</p>',
        id: 'post_123',
        publish_date: 0,
        status: 'draft',
        subtitle: '',
        title: 'Test Post',
        web_url: 'https://beehiiv.com/posts/post_123',
      };
      httpPostMock.mockReturnValue(of({ data: { data: mockPost } }));

      const result = await service.createPost('api-key', 'pub_abc123', {
        contentHtml: '<p>Hello</p>',
        status: 'draft',
        title: 'Test Post',
      });

      expect(result).toEqual(mockPost);
      expect(httpPostMock).toHaveBeenCalledWith(
        'https://api.beehiiv.com/v2/publications/pub_abc123/posts',
        { body_content: '<p>Hello</p>', status: 'draft', title: 'Test Post' },
        expect.any(Object),
      );
    });

    it('should create a confirmed post when status is confirmed', async () => {
      const mockPost = {
        id: 'post_456',
        status: 'confirmed',
        title: 'Published',
      };
      httpPostMock.mockReturnValue(of({ data: { data: mockPost } }));

      const result = await service.createPost('api-key', 'pub_abc123', {
        contentHtml: '<p>Live!</p>',
        status: 'confirmed',
        title: 'Published',
      });

      expect(result.status).toBe('confirmed');
      expect(httpPostMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'confirmed' }),
        expect.any(Object),
      );
    });

    it('creates a confirmed scheduled post with the approved timestamp', async () => {
      httpPostMock.mockReturnValue(
        of({ data: { data: { id: 'post_scheduled' } } }),
      );
      const scheduledAt = new Date('2026-08-10T09:30:00.000Z');

      await service.createPost('api-key', 'pub_abc123', {
        contentHtml: '<p>Later</p>',
        scheduledAt,
        status: 'confirmed',
        title: 'Scheduled',
      });

      expect(httpPostMock).toHaveBeenCalledWith(
        expect.any(String),
        {
          body_content: '<p>Later</p>',
          scheduled_at: '2026-08-10T09:30:00.000Z',
          status: 'confirmed',
          title: 'Scheduled',
        },
        expect.any(Object),
      );
    });

    it('rejects a draft with a scheduled timestamp before an HTTP request', async () => {
      await expect(
        service.createPost('api-key', 'pub_abc123', {
          contentHtml: '<p>Invalid</p>',
          scheduledAt: new Date('2026-08-10T09:30:00.000Z'),
          status: 'draft',
          title: 'Invalid draft',
        }),
      ).rejects.toMatchObject({
        code: 'validation_failed',
        isRetryable: false,
      });
      expect(httpPostMock).not.toHaveBeenCalled();
    });
  });

  describe('getDecryptedApiKey', () => {
    const orgId = 'test-object-id';
    const brandId = 'test-object-id';

    it('should return decrypted apiKey and publicationId', async () => {
      credentialsFindOneMock.mockResolvedValue({
        accessToken: 'encrypted-token',
        externalId: 'pub_abc123',
        platform: CredentialPlatform.BEEHIIV,
      });

      const result = await service.getDecryptedApiKey(orgId, brandId);

      expect(result).toEqual({
        apiKey: 'decrypted:encrypted-token',
        publicationId: 'pub_abc123',
      });
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted-token');
    });

    it('reads the API key of the account named by credentialId', async () => {
      // A brand may hold several Beehiiv publications; the caller names which
      // one it is acting as instead of taking the brand default.
      credentialsFindOneMock.mockResolvedValue({
        accessToken: 'encrypted-token',
        externalId: 'pub_abc123',
      });

      await service.getDecryptedApiKey(orgId, brandId, 'credential-1');

      expect(credentialsResolveMock).toHaveBeenCalledWith({
        brandId,
        credentialId: 'credential-1',
        isDisconnectedIncluded: true,
        organizationId: orgId,
        platform: CredentialPlatform.BEEHIIV,
      });
    });

    it('should throw when credential is not found', async () => {
      credentialsFindOneMock.mockResolvedValue(null);

      await expect(service.getDecryptedApiKey(orgId, brandId)).rejects.toThrow(
        'Beehiiv credential or publication ID not found',
      );
    });

    it('should throw when accessToken is missing', async () => {
      credentialsFindOneMock.mockResolvedValue({
        accessToken: null,
        externalId: 'pub_abc123',
      });

      await expect(service.getDecryptedApiKey(orgId, brandId)).rejects.toThrow(
        'Beehiiv credential or publication ID not found',
      );
    });

    it('should throw when externalId is missing', async () => {
      credentialsFindOneMock.mockResolvedValue({
        accessToken: 'token',
        externalId: null,
      });

      await expect(service.getDecryptedApiKey(orgId, brandId)).rejects.toThrow(
        'Beehiiv credential or publication ID not found',
      );
    });
  });
});
