vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    organization: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439013',
  })),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TiktokController } from '@api/services/integrations/tiktok/controllers/tiktok.controller';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { of } from 'rxjs';

describe('TiktokController', () => {
  let controller: TiktokController;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    saveCredentials: ReturnType<typeof vi.fn>;
  };
  let tiktokService: {
    getTiktokInfo: ReturnType<typeof vi.fn>;
    getTrends: ReturnType<typeof vi.fn>;
  };
  let httpService: { post: ReturnType<typeof vi.fn> };

  const mockRequest = {} as unknown as Request;
  const mockUser = { id: 'clerk_user_1' } as never;
  const brandId = new Types.ObjectId();
  const orgId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const credentialId = new Types.ObjectId();

  const mockBrand = { _id: brandId, organization: orgId };

  beforeEach(async () => {
    brandsService = { findOne: vi.fn().mockResolvedValue(mockBrand) };
    credentialsService = {
      findOne: vi.fn().mockResolvedValue({ _id: credentialId }),
      patch: vi
        .fn()
        .mockImplementation((_id, data) =>
          Promise.resolve({ _id: credentialId, ...data }),
        ),
      saveCredentials: vi.fn().mockResolvedValue({ _id: credentialId }),
    };
    tiktokService = {
      getTiktokInfo: vi.fn().mockResolvedValue({
        userId: 'tiktok_ext_id',
        username: 'tiktok_handle',
      }),
      getTrends: vi.fn().mockResolvedValue([{ title: 'trend1' }]),
    };
    httpService = { post: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TiktokController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockImplementation((key: string) => {
              if (key === 'GENFEEDAI_APP_URL') return 'https://app.genfeed.ai';
              return 'mock-value';
            }),
          },
        },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
        { provide: BrandsService, useValue: brandsService },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: TiktokService, useValue: tiktokService },
        { provide: HttpService, useValue: httpService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TiktokController>(TiktokController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    const dto = { brand: brandId.toString() };

    it('should return TikTok OAuth URL', async () => {
      const result = await controller.connect(mockRequest, mockUser, dto);
      expect(result).toEqual({
        url: expect.stringContaining('tiktok.com/v2/auth/authorize'),
      });
    });

    it('should save unconnected credential', async () => {
      await controller.connect(mockRequest, mockUser, dto);
      expect(credentialsService.saveCredentials).toHaveBeenCalledWith(
        mockBrand,
        'tiktok',
        expect.objectContaining({ isConnected: false }),
      );
    });

    it('should throw FORBIDDEN when brand not found', async () => {
      brandsService.findOne.mockResolvedValueOnce(null);
      await expect(
        controller.connect(mockRequest, mockUser, dto),
      ).rejects.toThrow(HttpException);
    });

    it('should include state with brandId and organizationId in URL', async () => {
      const result = (await controller.connect(mockRequest, mockUser, dto)) as {
        url: string;
      };
      const url = new URL(result.url);
      const state = JSON.parse(
        decodeURIComponent(url.searchParams.get('state')!),
      ) as { brandId: string; organizationId: string };
      expect(state.brandId).toBe(brandId.toString());
      expect(state.organizationId).toBe(orgId.toString());
    });
  });

  describe('verify', () => {
    const state = JSON.stringify({
      brandId: brandId.toString(),
      organizationId: orgId.toString(),
    });
    const dto = { code: 'tiktok_code_123', state };

    beforeEach(() => {
      httpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'tt_access',
            expires_in: 86400,
            refresh_token: 'tt_refresh',
            refresh_token_expires_in: 2592000,
          },
        }),
      );
    });

    it('should exchange code and update credential with tokens', async () => {
      await controller.verify(mockRequest, dto);
      expect(credentialsService.patch).toHaveBeenCalledWith(
        credentialId,
        expect.objectContaining({
          accessToken: 'tt_access',
          isConnected: true,
          isDeleted: false,
          refreshToken: 'tt_refresh',
        }),
      );
    });

    it('should fetch TikTok user info and set external handle', async () => {
      const result = await controller.verify(mockRequest, dto);
      expect(tiktokService.getTiktokInfo).toHaveBeenCalledWith(
        orgId.toString(),
        brandId.toString(),
        'tt_access',
      );
      expect(result).toEqual(
        expect.objectContaining({
          externalHandle: 'tiktok_handle',
          externalId: 'tiktok_ext_id',
        }),
      );
    });

    it('should throw BAD_REQUEST when code is missing', async () => {
      await expect(controller.verify(mockRequest, { state })).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw BAD_REQUEST when state is missing', async () => {
      await expect(
        controller.verify(mockRequest, { code: 'abc' }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when no pending credential found', async () => {
      credentialsService.findOne.mockResolvedValueOnce(null);
      await expect(controller.verify(mockRequest, dto)).rejects.toThrow(
        HttpException,
      );
    });

    it('should set token expiry dates', async () => {
      await controller.verify(mockRequest, dto);
      const patchCall = credentialsService.patch.mock.calls[0] as [
        Types.ObjectId,
        Record<string, unknown>,
      ];
      expect(patchCall[1].accessTokenExpiry).toBeInstanceOf(Date);
      expect(patchCall[1].refreshTokenExpiry).toBeInstanceOf(Date);
    });

    it('should reactivate previously deleted credential', async () => {
      await controller.verify(mockRequest, dto);
      const patchCall = credentialsService.patch.mock.calls[0] as [
        Types.ObjectId,
        Record<string, unknown>,
      ];
      expect(patchCall[1].isDeleted).toBe(false);
    });
  });

  describe('getTrends', () => {
    it('should return trends from TikTok service', async () => {
      const result = await controller.getTrends();
      expect(result).toEqual([{ title: 'trend1' }]);
    });

    it('should throw INTERNAL_SERVER_ERROR when service fails', () => {
      tiktokService.getTrends.mockImplementation(() => {
        throw new Error('API failed');
      });
      expect(() => controller.getTrends()).toThrow(HttpException);
    });
  });
});
