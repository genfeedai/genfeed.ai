vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((val: string) => `decrypted:${val}`),
    encrypt: vi.fn((val: string) => `encrypted:${val}`),
  },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { of, throwError } from 'rxjs';

describe('BeehiivService', () => {
  let service: BeehiivService;
  let httpGetMock: ReturnType<typeof vi.fn>;
  let httpPostMock: ReturnType<typeof vi.fn>;
  let credentialsFindOneMock: ReturnType<typeof vi.fn>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeehiivService,
        {
          provide: LoggerService,
          useValue: loggerMock,
        },
        {
          provide: HttpService,
          useValue: {
            get: httpGetMock,
            post: httpPostMock,
          },
        },
        {
          provide: CredentialsService,
          useValue: {
            findOne: credentialsFindOneMock,
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

      await expect(service.listPublications('bad-key')).rejects.toThrow(
        'Network error',
      );
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
      httpGetMock.mockReturnValue(throwError(() => new Error('Unauthorized')));

      await expect(
        service.getSubscribers('bad-key', 'pub_abc123'),
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('createSubscriber', () => {
    it('should create a subscriber and return it', async () => {
      httpPostMock.mockReturnValue(of({ data: { data: mockSubscriber } }));

      const result = await service.createSubscriber(
        'api-key',
        'pub_abc123',
        'sub@example.com',
        'twitter',
      );

      expect(result).toEqual(mockSubscriber);
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

      await service.createSubscriber(
        'api-key',
        'pub_abc123',
        'sub@example.com',
      );

      expect(httpPostMock).toHaveBeenCalledWith(
        expect.any(String),
        { email: 'sub@example.com' },
        expect.any(Object),
      );
    });

    it('should throw when create fails', async () => {
      httpPostMock.mockReturnValue(throwError(() => new Error('Conflict')));

      await expect(
        service.createSubscriber('api-key', 'pub_abc123', 'dup@example.com'),
      ).rejects.toThrow('Conflict');
    });
  });

  describe('createPost', () => {
    it('should create a draft post by default', async () => {
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

      const result = await service.createPost(
        'api-key',
        'pub_abc123',
        'Test Post',
        '<p>Hello</p>',
      );

      expect(result).toEqual(mockPost);
      expect(httpPostMock).toHaveBeenCalledWith(
        'https://api.beehiiv.com/v2/publications/pub_abc123/posts',
        { content_html: '<p>Hello</p>', status: 'draft', title: 'Test Post' },
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

      const result = await service.createPost(
        'api-key',
        'pub_abc123',
        'Published',
        '<p>Live!</p>',
        'confirmed',
      );

      expect(result.status).toBe('confirmed');
    });
  });

  describe('getDecryptedApiKey', () => {
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();

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
