vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((payload: Record<string, string>) => ({
    errors: [payload],
  })),
  returnInternalServerError: vi.fn((msg: string) => ({
    errors: [{ detail: msg }],
  })),
  returnNotFound: vi.fn((type: string, id: string) => ({
    errors: [{ detail: `${type} ${id} not found` }],
  })),
  serializeCollection: vi.fn(
    (_req: unknown, _serializer: unknown, data: { docs?: unknown }) =>
      data.docs || data,
  ),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { InstagramController } from '@api/services/integrations/instagram/controllers/instagram.controller';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { of, throwError } from 'rxjs';

describe('InstagramController', () => {
  let controller: InstagramController;
  let brandsFindOneMock: ReturnType<typeof vi.fn>;
  let credentialsSaveCredentialsMock: ReturnType<typeof vi.fn>;
  let credentialsFindOneMock: ReturnType<typeof vi.fn>;
  let credentialsPatchMock: ReturnType<typeof vi.fn>;
  let httpGetMock: ReturnType<typeof vi.fn>;
  let httpPostMock: ReturnType<typeof vi.fn>;
  let instagramServiceMock: {
    getAvailableHandles: ReturnType<typeof vi.fn>;
    getTrends: ReturnType<typeof vi.fn>;
  };

  const configMock = {
    get: vi.fn((key: string) => {
      const config: Record<string, string> = {
        INSTAGRAM_API_VERSION: 'v18.0',
        INSTAGRAM_APP_ID: 'test_app_id',
        INSTAGRAM_APP_SECRET: 'test_app_secret',
        INSTAGRAM_GRAPH_URL: 'https://graph.facebook.com',
        INSTAGRAM_REDIRECT_URI: 'https://app.genfeed.ai/oauth/instagram',
      };
      return config[key];
    }),
  } as unknown as ConfigService;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  beforeEach(() => {
    vi.clearAllMocks();

    brandsFindOneMock = vi.fn();
    credentialsSaveCredentialsMock = vi.fn();
    credentialsFindOneMock = vi.fn();
    credentialsPatchMock = vi.fn();
    httpGetMock = vi.fn();
    httpPostMock = vi.fn();
    instagramServiceMock = {
      getAvailableHandles: vi.fn(),
      getTrends: vi.fn(),
    };

    const accountsMock = {
      findOne: brandsFindOneMock,
    } as unknown as BrandsService;

    const credentialsMock = {
      findOne: credentialsFindOneMock,
      patch: credentialsPatchMock,
      saveCredentials: credentialsSaveCredentialsMock,
    } as unknown as CredentialsService;

    const httpServiceMock = {
      get: httpGetMock,
      post: httpPostMock,
    } as unknown as HttpService;

    controller = new InstagramController(
      configMock,
      accountsMock,
      credentialsMock,
      httpServiceMock,
      instagramServiceMock as unknown as InstagramService,
      loggerMock,
    );
  });

  describe('connect', () => {
    const mockUser = {
      publicMetadata: {
        organization: '507f191e810c19729de860eb',
        user: '507f191e810c19729de860ec',
      },
    } as unknown as User;
    const mockRequest = {
      headers: { host: 'localhost:3001' },
      protocol: 'http',
      url: '/services/instagram/connect',
    } as unknown as Request;
    const brandOid = new Types.ObjectId('507f191e810c19729de860ea');

    it('should generate Instagram OAuth URL for brand connection', async () => {
      const mockBrand = {
        _id: brandOid,
        organization: new Types.ObjectId('507f191e810c19729de860eb'),
      };
      brandsFindOneMock.mockResolvedValue(mockBrand);
      credentialsSaveCredentialsMock.mockResolvedValue({});

      const result = await controller.connect(mockRequest, mockUser, {
        brand: brandOid,
      });

      expect(brandsFindOneMock).toHaveBeenCalledWith({
        _id: brandOid,
        isDeleted: false,
        organization: new Types.ObjectId('507f191e810c19729de860eb'),
      });
      expect(credentialsSaveCredentialsMock).toHaveBeenCalled();
      expect(result).toHaveProperty('data');
      const data = result.data as unknown as { url: string };
      expect(data).toHaveProperty('url');
      expect(data.url).toContain('facebook.com');
      expect(data.url).toContain('oauth');
    });

    it('should return bad request for invalid brand', async () => {
      brandsFindOneMock.mockResolvedValue(null);

      const result = await controller.connect(mockRequest, mockUser, {
        brand: brandOid,
      });

      expect(result).toHaveProperty('errors');
      expect(brandsFindOneMock).toHaveBeenCalled();
    });

    it('should include correct scopes in auth URL', async () => {
      brandsFindOneMock.mockResolvedValue({
        _id: brandOid,
        organization: new Types.ObjectId('507f191e810c19729de860eb'),
      });
      credentialsSaveCredentialsMock.mockResolvedValue({});

      const result = await controller.connect(mockRequest, mockUser, {
        brand: brandOid,
      });

      const url = (result.data as unknown as { url: string }).url;
      expect(url).toContain('instagram_basic');
      expect(url).toContain('instagram_content_publish');
    });

    it('should include state with brand and org IDs', async () => {
      brandsFindOneMock.mockResolvedValue({
        _id: brandOid,
        organization: new Types.ObjectId('507f191e810c19729de860eb'),
      });
      credentialsSaveCredentialsMock.mockResolvedValue({});

      const result = await controller.connect(mockRequest, mockUser, {
        brand: brandOid,
      });

      const url = (result.data as unknown as { url: string }).url;
      expect(url).toContain('state=');
    });
  });

  describe('verify', () => {
    const brandId = '507f191e810c19729de860ea';
    const orgId = '507f191e810c19729de860eb';
    const state = JSON.stringify({ brandId, organizationId: orgId });
    const mockRequest = {} as unknown as Request;

    it('should exchange code for long-lived token and update credential', async () => {
      const credId = new Types.ObjectId();
      httpPostMock.mockReturnValue(
        of({ data: { access_token: 'short-lived-token' } }),
      );
      httpGetMock.mockReturnValue(
        of({
          data: { access_token: 'long-lived-token', expires_in: 5184000 },
        }),
      );
      credentialsFindOneMock.mockResolvedValue({ _id: credId });
      credentialsPatchMock.mockResolvedValue({
        _id: credId,
        isConnected: true,
      });

      const result = await controller.verify(mockRequest, {
        code: 'auth-code',
        state,
      });

      expect(result.data).toEqual({ _id: credId, isConnected: true });
      expect(credentialsPatchMock).toHaveBeenCalledWith(
        credId,
        expect.objectContaining({
          accessToken: 'long-lived-token',
          isConnected: true,
          isDeleted: false,
        }),
      );
    });

    it('should return bad request when code or state is missing', async () => {
      const result = await controller.verify(mockRequest, {});

      expect(result).toHaveProperty('errors');
    });

    it('should return bad request when app credentials are missing', async () => {
      const emptyConfigMock = {
        get: vi.fn(() => undefined),
      } as unknown as ConfigService;
      const ctrl = new InstagramController(
        emptyConfigMock,
        { findOne: vi.fn() } as unknown as BrandsService,
        {
          findOne: vi.fn(),
          patch: vi.fn(),
          saveCredentials: vi.fn(),
        } as unknown as CredentialsService,
        { get: vi.fn(), post: vi.fn() } as unknown as HttpService,
        instagramServiceMock as unknown as InstagramService,
        loggerMock,
      );

      const result = await ctrl.verify(mockRequest, {
        code: 'code',
        state,
      });

      expect(result).toHaveProperty('errors');
    });

    it('should handle Facebook error code 190 (expired code)', async () => {
      httpPostMock.mockReturnValue(
        throwError(() => ({
          response: {
            data: {
              error: { code: 190, message: 'Code has expired' },
            },
            status: 400,
          },
        })),
      );

      const result = await controller.verify(mockRequest, {
        code: 'expired-code',
        state,
      });

      expect(result).toHaveProperty('errors');
    });

    it('should return not found when credential does not exist', async () => {
      httpPostMock.mockReturnValue(of({ data: { access_token: 'short' } }));
      httpGetMock.mockReturnValue(
        of({ data: { access_token: 'long', expires_in: 3600 } }),
      );
      credentialsFindOneMock.mockResolvedValue(null);

      const result = await controller.verify(mockRequest, {
        code: 'code',
        state,
      });

      expect(result).toHaveProperty('errors');
    });

    it('should return bad request when short-lived token is missing', async () => {
      httpPostMock.mockReturnValue(of({ data: { access_token: null } }));

      const result = await controller.verify(mockRequest, {
        code: 'code',
        state,
      });

      expect(result).toHaveProperty('errors');
    });
  });

  describe('getTrends', () => {
    it('should return trends from instagramService', () => {
      const trends = [{ name: '#fashion', volume: 500 }];
      instagramServiceMock.getTrends.mockReturnValue(trends);

      const result = controller.getTrends();

      expect(result).toEqual(trends);
    });

    it('should return error when getTrends throws', () => {
      instagramServiceMock.getTrends.mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      const result = controller.getTrends();

      expect(result).toHaveProperty('errors');
    });
  });
});
