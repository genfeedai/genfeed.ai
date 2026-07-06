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

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: '507f191e810c19729de860eb',
    user: '507f191e810c19729de860ec',
  })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { DevtoController } from '@api/services/integrations/devto/controllers/devto.controller';
import { DevtoService } from '@api/services/integrations/devto/services/devto.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('DevtoController', () => {
  let controller: DevtoController;
  let devtoService: {
    getCurrentUser: ReturnType<typeof vi.fn>;
    publishArticle: ReturnType<typeof vi.fn>;
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

  const mockDevtoUser = {
    id: 12_345,
    name: 'Dev Founder',
    profile_image: 'https://dev.to/avatar.png',
    username: 'devfounder',
  };

  beforeEach(async () => {
    devtoService = {
      getCurrentUser: vi.fn(),
      publishArticle: vi.fn(),
    };
    brandsService = { findOne: vi.fn() };
    credentialsService = { saveCredentials: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevtoController],
      providers: [
        { provide: DevtoService, useValue: devtoService },
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: LoggerService, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<DevtoController>(DevtoController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    it('should connect successfully with a valid apiKey and brandId', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      devtoService.getCurrentUser.mockResolvedValue(mockDevtoUser);
      credentialsService.saveCredentials.mockResolvedValue({
        _id: 'test-object-id',
        platform: CredentialPlatform.DEV_TO,
      });

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'test-api-key',
        brandId: '507f191e810c19729de860ea',
      });

      expect(devtoService.getCurrentUser).toHaveBeenCalledWith('test-api-key');
      expect(credentialsService.saveCredentials).toHaveBeenCalledWith(
        mockBrand,
        CredentialPlatform.DEV_TO,
        {
          accessToken: 'test-api-key',
          externalHandle: mockDevtoUser.username,
          externalId: String(mockDevtoUser.id),
          externalName: mockDevtoUser.name,
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
      expect(devtoService.getCurrentUser).not.toHaveBeenCalled();
    });

    it('should return bad request when the api key cannot be verified', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      devtoService.getCurrentUser.mockResolvedValue({});

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'bad-key',
        brandId: '507f191e810c19729de860ea',
      });

      expect(result).toHaveProperty('errors');
      expect(credentialsService.saveCredentials).not.toHaveBeenCalled();
    });

    it('should return internal server error when verification throws', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand);
      devtoService.getCurrentUser.mockRejectedValue(new Error('dev.to down'));

      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'bad-key',
        brandId: '507f191e810c19729de860ea',
      });

      expect(result).toHaveProperty('errors');
    });
  });

  describe('publishArticle', () => {
    it('should publish and parse tags + published flag from query', async () => {
      devtoService.publishArticle.mockResolvedValue({
        id: 999,
        url: 'https://dev.to/devfounder/hello-abc',
      });

      const result = await controller.publishArticle(
        mockUser,
        'article-1',
        '507f191e810c19729de860ea',
        'false',
        'typescript, webdev ,',
        'https://mysite.dev/hello',
      );

      expect(devtoService.publishArticle).toHaveBeenCalledWith(
        'article-1',
        '507f191e810c19729de860eb',
        '507f191e810c19729de860ea',
        {
          canonicalUrl: 'https://mysite.dev/hello',
          published: false,
          tags: ['typescript', 'webdev'],
        },
      );
      expect(result).toEqual(expect.objectContaining({ success: true }));
    });

    it('should default published to true and tags to empty', async () => {
      devtoService.publishArticle.mockResolvedValue({ id: 1 });

      await controller.publishArticle(
        mockUser,
        'article-1',
        '507f191e810c19729de860ea',
      );

      expect(devtoService.publishArticle).toHaveBeenCalledWith(
        'article-1',
        '507f191e810c19729de860eb',
        '507f191e810c19729de860ea',
        {
          canonicalUrl: undefined,
          published: true,
          tags: [],
        },
      );
    });

    it('should return bad request when brandId is missing', async () => {
      const result = await controller.publishArticle(mockUser, 'article-1', '');

      expect(result).toHaveProperty('errors');
      expect(devtoService.publishArticle).not.toHaveBeenCalled();
    });

    it('should return internal server error when publish throws', async () => {
      devtoService.publishArticle.mockRejectedValue(new Error('boom'));

      const result = await controller.publishArticle(
        mockUser,
        'article-1',
        '507f191e810c19729de860ea',
      );

      expect(result).toHaveProperty('errors');
    });
  });
});
