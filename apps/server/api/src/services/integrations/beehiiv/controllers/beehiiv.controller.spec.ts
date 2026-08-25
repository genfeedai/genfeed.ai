vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((payload: Record<string, string>) => ({
    errors: [payload],
  })),
  returnInternalServerError: vi.fn((msg: string) => ({
    errors: [{ detail: msg }],
  })),
  returnUnauthorized: vi.fn((msg: string) => ({
    errors: [{ detail: msg }],
  })),
  serializeCollection: vi.fn(
    (_req: unknown, _serializer: unknown, data: { docs?: unknown }) =>
      data.docs || data,
  ),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { BeehiivController } from '@api/services/integrations/beehiiv/controllers/beehiiv.controller';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('BeehiivController', () => {
  let controller: BeehiivController;
  let beehiivService: {
    listPublications: ReturnType<typeof vi.fn>;
    getDecryptedApiKey: ReturnType<typeof vi.fn>;
    getSubscribers: ReturnType<typeof vi.fn>;
    createSubscribers: ReturnType<typeof vi.fn>;
  };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    createPendingForBrand: ReturnType<typeof vi.fn>;
    updateExternalProfile: ReturnType<typeof vi.fn>;
  };

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  const mockUser = {
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;

  const mockRequest = {} as unknown as Request;

  const mockBrand = {
    id: testId('brand'),
    organizationId: testId('org'),
  };

  const mockPublication = {
    created: 1_700_000_000,
    description: 'Test newsletter',
    id: 'pub_abc123',
    name: 'My Newsletter',
    url: 'https://newsletter.beehiiv.com',
  };
  const alternatePublication = {
    created: 1_700_000_002,
    description: 'Second newsletter',
    id: 'pub_selected',
    name: 'Selected Newsletter',
    url: 'https://selected.beehiiv.com',
  };

  beforeEach(async () => {
    beehiivService = {
      createSubscribers: vi.fn(),
      getDecryptedApiKey: vi.fn(),
      getSubscribers: vi.fn(),
      listPublications: vi.fn(),
    };
    brandsService = { findOne: vi.fn() };
    credentialsService = {
      createPendingForBrand: vi
        .fn()
        .mockResolvedValue({ id: 'pending-credential-id' }),
      updateExternalProfile: vi.fn().mockResolvedValue({
        id: 'test-object-id',
        platform: CredentialPlatform.BEEHIIV,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BeehiivController],
      providers: [
        { provide: BeehiivService, useValue: beehiivService },
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<BeehiivController>(BeehiivController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    it('should connect successfully with valid apiKey and brandId', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockResolvedValue([mockPublication]);
      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: testId('brand'),
      });

      expect(beehiivService.listPublications).toHaveBeenCalledWith(
        'test-api-key',
      );
      expect(credentialsService.createPendingForBrand).toHaveBeenCalledWith(
        mockBrand,
        testId('user'),
        CredentialPlatform.BEEHIIV,
        { accessToken: 'test-api-key' },
      );
      expect(credentialsService.updateExternalProfile).toHaveBeenCalledWith(
        'pending-credential-id',
        mockBrand.organizationId,
        {
          handle: mockPublication.name,
          id: mockPublication.id,
          name: mockPublication.name,
        },
      );
      expect(result).toHaveProperty('data');
    });

    it('should connect to the selected publication when publicationId is provided', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockResolvedValue([
        mockPublication,
        alternatePublication,
      ]);
      await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: testId('brand'),
        publicationId: 'pub_selected',
      });

      expect(credentialsService.updateExternalProfile).toHaveBeenCalledWith(
        'pending-credential-id',
        mockBrand.organizationId,
        {
          handle: alternatePublication.name,
          id: alternatePublication.id,
          name: alternatePublication.name,
        },
      );
    });

    it('should return bad request when selected publication is not available', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockResolvedValue([mockPublication]);

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: testId('brand'),
        publicationId: 'pub_missing',
      });

      expect(result).toHaveProperty('errors');
      expect(credentialsService.createPendingForBrand).not.toHaveBeenCalled();
    });

    it('should return bad request when apiKey is missing', async () => {
      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: '',
        brandId: testId('brand'),
      });

      expect(result).toHaveProperty('errors');
      expect(brandsService.findOne).not.toHaveBeenCalled();
    });

    it('should return bad request when brandId is missing', async () => {
      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: '',
      });

      expect(result).toHaveProperty('errors');
    });

    it('should return bad request when brand is not found', async () => {
      brandsService.findOne.mockResolvedValue(null);

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: testId('brand'),
      });

      expect(result).toHaveProperty('errors');
      expect(beehiivService.listPublications).not.toHaveBeenCalled();
    });

    it('should return bad request when no publications found', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockResolvedValue([]);

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: testId('brand'),
      });

      expect(result).toHaveProperty('errors');
      expect(credentialsService.createPendingForBrand).not.toHaveBeenCalled();
    });

    it('should return internal server error when listPublications throws', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockRejectedValue(
        new Error('Beehiiv API down'),
      );

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'bad-key',
        brandId: testId('brand'),
      });

      expect(result).toHaveProperty('errors');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('listPublications', () => {
    it('should return publications for a valid brandId', async () => {
      beehiivService.getDecryptedApiKey.mockResolvedValue({
        apiKey: 'decrypted-key',
        publicationId: 'pub_abc123',
      });
      beehiivService.listPublications.mockResolvedValue([mockPublication]);

      const result = await controller.listPublications(
        mockUser,
        testId('brand'),
      );

      expect(result).toEqual({ data: [mockPublication] });
    });

    it('should return bad request when brandId is empty', async () => {
      const result = await controller.listPublications(mockUser, '');

      expect(result).toHaveProperty('errors');
    });

    it('should return internal server error when service throws', async () => {
      beehiivService.getDecryptedApiKey.mockRejectedValue(
        new Error('Credential not found'),
      );

      const result = await controller.listPublications(
        mockUser,
        testId('brand'),
      );

      expect(result).toHaveProperty('errors');
    });
  });

  describe('getSubscribers', () => {
    it('should return subscribers for a valid brandId', async () => {
      beehiivService.getDecryptedApiKey.mockResolvedValue({
        apiKey: 'decrypted-key',
        publicationId: 'pub_abc123',
      });
      beehiivService.getSubscribers.mockResolvedValue({
        data: [{ email: 'sub@example.com', id: 'sub_1' }],
        total_results: 1,
      });

      const result = await controller.getSubscribers(
        mockUser,
        testId('brand'),
        '1',
        '20',
      );

      expect(beehiivService.getSubscribers).toHaveBeenCalledWith(
        'decrypted-key',
        'pub_abc123',
        1,
        20,
      );
      expect(result).toHaveProperty('data');
    });

    it('should return bad request when brandId is missing', async () => {
      const result = await controller.getSubscribers(mockUser, '');

      expect(result).toHaveProperty('errors');
    });

    it('should handle missing page and limit gracefully', async () => {
      beehiivService.getDecryptedApiKey.mockResolvedValue({
        apiKey: 'decrypted-key',
        publicationId: 'pub_abc123',
      });
      beehiivService.getSubscribers.mockResolvedValue({
        data: [],
        total_results: 0,
      });

      await controller.getSubscribers(mockUser, testId('brand'));

      expect(beehiivService.getSubscribers).toHaveBeenCalledWith(
        'decrypted-key',
        'pub_abc123',
        undefined,
        undefined,
      );
    });
  });

  describe('createSubscribers', () => {
    it('returns a serialized outcome for every submitted address', async () => {
      beehiivService.getDecryptedApiKey.mockResolvedValue({
        apiKey: 'decrypted-key',
        publicationId: 'pub_abc123',
      });
      beehiivService.createSubscribers.mockResolvedValue([
        {
          email: 'new@example.com',
          id: 'new@example.com',
          status: 'active',
          subscriberId: 'sub_new',
          success: true,
        },
        {
          email: 'rejected@example.com',
          errorCode: 'validation_failed',
          errorMessage: 'Beehiiv rejected the request payload.',
          id: 'rejected@example.com',
          isRetryable: false,
          success: false,
        },
      ]);

      const result = await controller.createSubscribers(mockRequest, mockUser, {
        brandId: testId('brand'),
        emails: ['new@example.com', 'rejected@example.com'],
        utmSource: 'twitter',
      });

      expect(beehiivService.createSubscribers).toHaveBeenCalledWith(
        'decrypted-key',
        'pub_abc123',
        ['new@example.com', 'rejected@example.com'],
        'twitter',
      );
      expect(result).toHaveLength(2);
    });

    it('should return internal server error when service throws', async () => {
      beehiivService.getDecryptedApiKey.mockRejectedValue(
        new Error('No credential'),
      );

      const result = await controller.createSubscribers(mockRequest, mockUser, {
        brandId: testId('brand'),
        emails: ['new@example.com'],
      });

      expect(result).toEqual({
        errors: [{ detail: 'Failed to create Beehiiv subscribers' }],
      });
    });
  });
});
