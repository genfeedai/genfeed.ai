import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  returnBadRequest,
  returnInternalServerError,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { GhostController } from './ghost.controller';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((x) => ({ error: x })),
  returnInternalServerError: vi.fn((msg) => ({ error: msg })),
  serializeSingle: vi.fn((_req, _s, data) => ({ data })),
}));

const mockOrgId = testId('org');
const mockUserId = testId('user');
const mockBrandId = testId('brand');
const mockBrand = {
  id: mockBrandId,
  name: 'TestBrand',
  organizationId: mockOrgId,
};

const mockUser = {
  brandId: mockBrandId,
  id: 'auth-provider-user',
  organizationId: mockOrgId,
  userId: mockUserId,
} as User;
const mockRequest = {} as Request;

describe('GhostController', () => {
  let controller: GhostController;
  let ghostService: vi.Mocked<GhostService>;
  let brandsService: vi.Mocked<BrandsService>;
  let credentialsService: vi.Mocked<CredentialsService>;

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
          useValue: {
            createPendingForBrand: vi
              .fn()
              .mockResolvedValue({ id: 'pending-credential-id' }),
            updateExternalProfile: vi.fn(),
          },
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
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // connect

  describe('connect', () => {
    const validBody = {
      apiKey: '64f0c0ab12cd34ef56ab78cd:9a1b2c3d4e5f6071',
      brandId: mockBrandId,
      ghostUrl: 'https://myblog.ghost.io',
    };

    it('returns bad request when ghostUrl is missing', async () => {
      const result = await controller.connect(mockRequest, mockUser, {
        apiKey: 'key',
        brandId: mockBrandId,
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
        id: 'cred1',
        platform: CredentialPlatform.GHOST,
      };
      credentialsService.updateExternalProfile.mockResolvedValue(
        mockCredential as never,
      );

      const result = await controller.connect(mockRequest, mockUser, validBody);

      expect(ghostService.getSiteInfo).toHaveBeenCalledWith(
        validBody.ghostUrl,
        validBody.apiKey,
      );
      expect(credentialsService.createPendingForBrand).toHaveBeenCalledWith(
        mockBrand,
        mockUserId,
        CredentialPlatform.GHOST,
        { accessToken: validBody.apiKey },
      );
      // A Ghost site URL is an address, not a public @handle.
      expect(credentialsService.updateExternalProfile).toHaveBeenCalledWith(
        'pending-credential-id',
        mockOrgId,
        {
          handle: undefined,
          id: validBody.ghostUrl,
          name: 'My Ghost Blog',
        },
      );
      expect(serializeSingle).toHaveBeenCalled();
      expect(result).toMatchObject({ data: mockCredential });
    });

    it.each([
      [
        'an http:// site',
        { ghostUrl: 'http://myblog.ghost.io' },
        undefined,
        { code: 'API_KEY_CONNECT_HTTPS_REQUIRED', status: 400 },
      ],
      [
        'a Content API key instead of an Admin key',
        { apiKey: 'a1b2c3d4e5f6a7b8c9d0e1f2a3' },
        undefined,
        { code: 'API_KEY_CONNECT_INVALID_KEY_FORMAT', status: 400 },
      ],
      [
        'Ghost refusing the key',
        {},
        { isAxiosError: true, response: { status: 401 } },
        { code: 'API_KEY_CONNECT_KEY_REJECTED', status: 400 },
      ],
      [
        'an address that is not a Ghost site',
        {},
        { isAxiosError: true, response: { status: 404 } },
        { code: 'API_KEY_CONNECT_API_NOT_FOUND', status: 400 },
      ],
      [
        'a site that never answers',
        {},
        { code: 'ECONNABORTED', isAxiosError: true },
        { code: 'API_KEY_CONNECT_SITE_UNREACHABLE', status: 400 },
      ],
      [
        'an unclassified failure',
        {},
        new Error('Network error'),
        { code: 'API_KEY_CONNECT_UNKNOWN', status: 500 },
      ],
    ])(
      'refuses %s with its own reason and stores nothing',
      async (_case, override, siteError, expected) => {
        brandsService.findOne.mockResolvedValue(mockBrand as never);
        ghostService.getSiteInfo.mockRejectedValue(siteError);

        const failure = await controller
          .connect(mockRequest, mockUser, { ...validBody, ...override })
          .catch((error: HttpException) => ({
            code: (error.getResponse() as { code: string }).code,
            status: error.getStatus(),
          }));

        expect(failure).toEqual(expected);
        expect(credentialsService.createPendingForBrand).not.toHaveBeenCalled();
      },
    );

    it('stores the site address without the Ghost Admin path', async () => {
      brandsService.findOne.mockResolvedValue(mockBrand as never);
      ghostService.getSiteInfo.mockResolvedValue({
        title: 'My Ghost Blog',
      } as never);
      credentialsService.updateExternalProfile.mockImplementation(
        async (_id: string, _organizationId: string, profile: never) =>
          ({ externalProfile: profile }) as never,
      );

      const result = await controller.connect(mockRequest, mockUser, {
        ...validBody,
        ghostUrl: 'https://myblog.ghost.io/ghost/#/dashboard',
      });

      expect(result).toEqual({
        data: {
          externalProfile: {
            handle: undefined,
            id: 'https://myblog.ghost.io',
            name: 'My Ghost Blog',
          },
        },
      });
    });
  });

  // createPost

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
