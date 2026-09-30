import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { PinterestController } from '@api/services/integrations/pinterest/controllers/pinterest.controller';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('PinterestController', () => {
  let controller: PinterestController;
  const serviceMock = {
    createPin: vi.fn(),
    exchangeCodeForToken: vi.fn(),
    generateAuthUrl: vi.fn().mockReturnValue('url'),
    getPinAnalytics: vi.fn(),
    searchPins: vi.fn(),
  } as PinterestService;
  const loggerMock = { log: vi.fn() } as unknown as LoggerService;
  const brandsServiceMock = {
    findOne: vi.fn().mockResolvedValue({
      id: 'brand-id',
      organizationId: 'organization-id',
      userId: 'user-id',
    }),
  };
  const credentialsServiceMock = {
    beginOAuthForBrand: vi.fn().mockResolvedValue({
      credential: { id: 'credential-id' },
      state: 'opaque-oauth-state',
    }),
    findPendingOAuthCredential: vi.fn().mockResolvedValue({
      brandId: 'brand-id',
      id: 'credential-id',
      organizationId: 'organization-id',
      userId: 'user-id',
    }),
    patch: vi.fn().mockResolvedValue({
      id: 'credential-id',
      isConnected: true,
    }),
  };
  const user = {
    organizationId: 'organization-id',
    userId: 'user-id',
  } as unknown as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PinterestController],
      providers: [
        { provide: PinterestService, useValue: serviceMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: BrandsService, useValue: brandsServiceMock },
        { provide: CredentialsService, useValue: credentialsServiceMock },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PinterestController>(PinterestController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns an auth URL with server-issued state', async () => {
    const result = await controller.connect({} as never, user, {
      brandId: 'brand-id',
    });
    expect(serviceMock.generateAuthUrl).toHaveBeenCalledWith(
      'opaque-oauth-state',
    );
    expect(result).toEqual({ url: 'url' });
  });

  it('persists exchanged tokens on the pending credential', async () => {
    (serviceMock.exchangeCodeForToken as vi.Mock).mockResolvedValue({
      accessToken: 'pinterest-token',
      refreshToken: 'pinterest-refresh-token',
    });

    const result = await controller.verify({} as never, {
      code: 'auth-code',
      state: 'opaque-oauth-state',
    });

    expect(credentialsServiceMock.patch).toHaveBeenCalledWith(
      'credential-id',
      expect.objectContaining({
        accessToken: 'pinterest-token',
        oauthState: null,
        refreshToken: 'pinterest-refresh-token',
      }),
    );
    expect(result).toEqual({ id: 'credential-id', isConnected: true });
  });

  it('creates pin via service', async () => {
    (serviceMock.createPin as vi.Mock).mockResolvedValue('1');
    const res = await controller.createPin({
      accessToken: 'token',
      boardId: 'board',
      imageUrl: 'img',
      title: 't',
    });
    expect(serviceMock.createPin).toHaveBeenCalled();
    expect(res).toEqual({ data: { id: '1' } });
  });
});
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
