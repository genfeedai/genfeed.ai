import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnBadRequest,
  returnInternalServerError,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { GhostController } from './ghost.controller';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((x) => ({ error: x })),
  returnInternalServerError: vi.fn((msg) => ({ error: msg })),
  serializeSingle: vi.fn((_req, _s, data) => ({ data })),
}));

const mockOrgId = new Types.ObjectId().toHexString();
const mockUserId = new Types.ObjectId().toHexString();
const mockBrandId = new Types.ObjectId().toHexString();
const mockBrand = { _id: new Types.ObjectId(mockBrandId), name: 'TestBrand' };

const mockUser = {} as User;
const mockRequest = {} as Request;

describe('GhostController', () => {
  let controller: GhostController;
  let ghostService: vi.Mocked<GhostService>;
  let brandsService: vi.Mocked<BrandsService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GhostController],
      providers: [
        {
          provide: GhostService,
          useValue: {
            createPost: vi.fn(),
            getSiteInfo: vi.fn(),
          },
        },
        {
          provide: BrandsService,
          useValue: { findOne: vi.fn() },
        },
        {
          provide: CredentialsService,
          useValue: { saveCredentials: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    controller = module.get(GhostController);
    ghostService = module.get(GhostService);
    brandsService = module.get(BrandsService);
    credentialsService = module.get(CredentialsService);
    loggerService = module.get(LoggerService);

    vi.mocked(getPublicMetadata).mockReturnValue({
      organization: mockOrgId,
      user: mockUserId,
    } as ReturnType<typeof getPublicMetadata>);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── connect ──────────────────────────────────────────────────────────────

  describe('connect', () => {
    const validBody = {
      apiKey: 'ghost-admin-key',
      brand: mockBrandId,
      ghostUrl: 'https://myblog.ghost.io',
    };

    it('returns bad request when ghostUrl is missing', async () => {
      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'key',
        brand: mockBrandId,
      } as never);
      expect(returnBadRequest).toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.anything() });
    });

    it('returns bad request when brand is not found', async () => {
      brandsService.findOne.mockResolvedValue(null as never);
      const result = await controller.connect(mockRequest, mockUser, validBody);
      expect(result).toMatchObject({ error: expect.anything() });
    });

    it('connects Ghost successfully and returns serialized credential', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand as never);
      ghostService.getSiteInfo.mockResolvedValue({
        title: 'My Ghost Blog',
      } as never);
      const mockCredential = {
        _id: 'cred1',
        platform: CredentialPlatform.GHOST,
      };
      credentialsService.saveCredentials.mockResolvedValue(
        mockCredential as never,
      );

      const result = await controller.connect(mockRequest, mockUser, validBody);

      expect(ghostService.getSiteInfo).toHaveBeenCalledWith(
        validBody.ghostUrl,
        validBody.apiKey,
      );
      expect(credentialsService.saveCredentials).toHaveBeenCalledWith(
        mockBrand,
        CredentialPlatform.GHOST,
        expect.objectContaining({ accessToken: validBody.apiKey }),
      );
      expect(serializeSingle).toHaveBeenCalled();
      expect(result).toMatchObject({ data: mockCredential });
    });

    it('returns internal server error when getSiteInfo throws', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand as never);
      ghostService.getSiteInfo.mockRejectedValue(new Error('Network error'));

      const result = await controller.connect(mockRequest, mockUser, validBody);
      expect(returnInternalServerError).toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.any(String) });
    });

    it('rethrows HttpException from getSiteInfo', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand as never);
      const httpEx = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
      ghostService.getSiteInfo.mockRejectedValue(httpEx);

      await expect(
        controller.connect(mockRequest, mockUser, validBody),
      ).rejects.toThrow(HttpException);
    });
  });

  // ── createPost ────────────────────────────────────────────────────────────

  describe('createPost', () => {
    const validBody = {
      apiKey: 'ghost-admin-key',
      ghostUrl: 'https://myblog.ghost.io',
      html: '<p>Content</p>',
      title: 'My Post',
    };

    it('returns bad request when title is missing', async () => {
      const result = await controller.createPost(mockUser, {
        apiKey: 'k',
        ghostUrl: 'https://x.io',
        html: '<p></p>',
      } as never);
      expect(returnBadRequest).toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.anything() });
    });

    it('creates post and returns structured response', async () => {
      const mockPost = {
        id: 'post1',
        slug: 'my-post',
        status: 'draft',
        title: 'My Post',
        url: 'https://myblog.ghost.io/my-post',
      };
      ghostService.createPost.mockResolvedValue(mockPost as never);

      const result = await controller.createPost(mockUser, validBody);

      expect(ghostService.createPost).toHaveBeenCalledWith(
        validBody.ghostUrl,
        validBody.apiKey,
        validBody.title,
        validBody.html,
        'draft',
        undefined,
        undefined,
      );
      expect(result).toEqual({
        data: {
          id: mockPost.id,
          slug: mockPost.slug,
          status: mockPost.status,
          title: mockPost.title,
          url: mockPost.url,
        },
        success: true,
      });
    });

    it('uses provided status when given', async () => {
      ghostService.createPost.mockResolvedValue({
        id: 'p2',
        slug: 'published',
        status: 'published',
        title: 'T',
        url: 'https://x.io/published',
      } as never);

      await controller.createPost(mockUser, {
        ...validBody,
        status: 'published',
      });
      expect(ghostService.createPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        'published',
        undefined,
        undefined,
      );
    });

    it('returns internal server error when createPost throws', async () => {
      ghostService.createPost.mockRejectedValue(new Error('Ghost down'));
      const result = await controller.createPost(mockUser, validBody);
      expect(returnInternalServerError).toHaveBeenCalled();
      expect(result).toMatchObject({ error: expect.any(String) });
    });

    it('rethrows HttpException from createPost', async () => {
      const httpEx = new HttpException('Unauth', HttpStatus.UNAUTHORIZED);
      ghostService.createPost.mockRejectedValue(httpEx);

      await expect(controller.createPost(mockUser, validBody)).rejects.toThrow(
        HttpException,
      );
    });
  });
});
