vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((payload: Record<string, string>) => ({
    errors: [payload],
  })),
  returnInternalServerError: vi.fn((msg: string) => ({
    errors: [{ detail: msg }],
  })),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: '507f191e810c19729de860eb',
    user: '507f191e810c19729de860ec',
  })),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { BeehiivController } from '@api/services/integrations/beehiiv/controllers/beehiiv.controller';
import { BeehiivService } from '@api/services/integrations/beehiiv/services/beehiiv.service';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('BeehiivController', () => {
  let controller: BeehiivController;
  let beehiivService: {
    listPublications: ReturnType<typeof vi.fn>;
    getDecryptedApiKey: ReturnType<typeof vi.fn>;
    getSubscribers: ReturnType<typeof vi.fn>;
    createSubscriber: ReturnType<typeof vi.fn>;
  };
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: { saveCredentials: ReturnType<typeof vi.fn> };

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  const mockUser = {
    publicMetadata: {
      organization: '507f191e810c19729de860eb',
      user: '507f191e810c19729de860ec',
    },
  } as unknown as User;

  const mockRequest = {} as unknown as Request;

  const mockBrand = {
    _id: '507f191e810c19729de860ea',
    organization: '507f191e810c19729de860eb',
  };

  const mockPublication = {
    created: 1_700_000_000,
    description: 'Test newsletter',
    id: 'pub_abc123',
    name: 'My Newsletter',
    url: 'https://newsletter.beehiiv.com',
  };

  beforeEach(async () => {
    beehiivService = {
      createSubscriber: vi.fn(),
      getDecryptedApiKey: vi.fn(),
      getSubscribers: vi.fn(),
      listPublications: vi.fn(),
    };
    brandsService = { findOne: vi.fn() };
    credentialsService = { saveCredentials: vi.fn() };

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
      credentialsService.saveCredentials.mockResolvedValue({
        _id: 'test-object-id',
        platform: CredentialPlatform.BEEHIIV,
      });

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: '507f191e810c19729de860ea',
      });

      expect(beehiivService.listPublications).toHaveBeenCalledWith(
        'test-api-key',
      );
      expect(credentialsService.saveCredentials).toHaveBeenCalledWith(
        mockBrand,
        CredentialPlatform.BEEHIIV,
        {
          accessToken: 'test-api-key',
          externalHandle: mockPublication.name,
          externalId: mockPublication.id,
          isConnected: true,
        },
      );
      expect(result).toHaveProperty('data');
    });

    it('should return bad request when apiKey is missing', async () => {
      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: '',
        brandId: '507f191e810c19729de860ea',
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
        brandId: '507f191e810c19729de860ea',
      });

      expect(result).toHaveProperty('errors');
      expect(beehiivService.listPublications).not.toHaveBeenCalled();
    });

    it('should return bad request when no publications found', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockResolvedValue([]);

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: '507f191e810c19729de860ea',
      });

      expect(result).toHaveProperty('errors');
      expect(credentialsService.saveCredentials).not.toHaveBeenCalled();
    });

    it('should return internal server error when listPublications throws', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      beehiivService.listPublications.mockRejectedValue(
        new Error('Beehiiv API down'),
      );

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'bad-key',
        brandId: '507f191e810c19729de860ea',
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
        '507f191e810c19729de860ea',
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
        '507f191e810c19729de860ea',
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
        '507f191e810c19729de860ea',
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

      await controller.getSubscribers(mockUser, '507f191e810c19729de860ea');

      expect(beehiivService.getSubscribers).toHaveBeenCalledWith(
        'decrypted-key',
        'pub_abc123',
        undefined,
        undefined,
      );
    });
  });

  describe('createSubscriber', () => {
    it('should create a subscriber with valid email and brandId', async () => {
      beehiivService.getDecryptedApiKey.mockResolvedValue({
        apiKey: 'decrypted-key',
        publicationId: 'pub_abc123',
      });
      beehiivService.createSubscriber.mockResolvedValue({
        email: 'new@example.com',
        id: 'sub_new',
        status: 'active',
      });

      const result = await controller.createSubscriber(mockUser, {
        brandId: '507f191e810c19729de860ea',
        email: 'new@example.com',
        utmSource: 'twitter',
      });

      expect(beehiivService.createSubscriber).toHaveBeenCalledWith(
        'decrypted-key',
        'pub_abc123',
        'new@example.com',
        'twitter',
      );
      expect(result).toHaveProperty('data');
    });

    it('should return bad request when brandId is missing', async () => {
      const result = await controller.createSubscriber(mockUser, {
        brandId: '',
        email: 'new@example.com',
      });

      expect(result).toHaveProperty('errors');
    });

    it('should return bad request when email is missing', async () => {
      const result = await controller.createSubscriber(mockUser, {
        brandId: '507f191e810c19729de860ea',
        email: '',
      });

      expect(result).toHaveProperty('errors');
    });

    it('should return internal server error when service throws', async () => {
      beehiivService.getDecryptedApiKey.mockRejectedValue(
        new Error('No credential'),
      );

      const result = await controller.createSubscriber(mockUser, {
        brandId: '507f191e810c19729de860ea',
        email: 'new@example.com',
      });

      expect(result).toHaveProperty('errors');
    });
  });
});
