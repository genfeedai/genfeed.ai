import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WarmupAccountsController } from './warmup-accounts.controller';
import { AdminWarmupAccountsService } from './warmup-accounts.service';

const mockGetPublicMetadata = vi.fn();

vi.mock('@api/endpoints/admin/guards/ip-whitelist.guard', () => ({
  IpWhitelistGuard: vi.fn().mockImplementation(function () {
    return { canActivate: vi.fn().mockReturnValue(true) };
  }),
}));

vi.mock('@api/helpers/decorators/user/current-user.decorator', () => ({
  CurrentUser:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getPublicMetadata: () => mockGetPublicMetadata(),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({
      data,
      serialized: true,
    }),
  ),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, item: unknown) => ({
      data: item,
      serialized: true,
    }),
  ),
}));

vi.mock('@genfeedai/serializers', () => ({
  WarmupAccountSerializer: {},
}));

const makeRequest = () => ({
  url: 'https://api.genfeed.ai/admin/warmup-accounts',
});

const makeUser = () => ({
  id: 'auth_provider_user_1',
  publicMetadata: { user: 'db_user_1' },
});

const makeWarmupAccount = () => ({
  _id: 'warmup_1',
  brandName: 'Acme',
  diagnostics: { steps: [] },
  id: 'warmup_1',
  leadEmail: 'lead@example.com',
  operatorUserId: 'db_user_1',
  organizationName: 'Acme Growth',
  status: 'INVITED',
});

describe('WarmupAccountsController', () => {
  let controller: WarmupAccountsController;

  const warmupAccountsService = {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
  };

  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetPublicMetadata.mockReturnValue({ user: 'db_user_1' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WarmupAccountsController],
      providers: [
        {
          provide: AdminWarmupAccountsService,
          useValue: warmupAccountsService,
        },
        { provide: LoggerService, useValue: loggerService },
      ],
    })
      .overrideGuard('IpWhitelistGuard')
      .useValue({ canActivate: () => true })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WarmupAccountsController>(WarmupAccountsController);
  });

  it('requires IP whitelist and platform superadmin guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      WarmupAccountsController,
    );

    expect(guards).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('creates warm-up accounts with the local DB user id', async () => {
    const account = makeWarmupAccount();
    warmupAccountsService.create.mockResolvedValue(account);

    const dto = {
      brandName: 'Acme',
      leadEmail: 'lead@example.com',
      organizationName: 'Acme Growth',
    };

    const result = await controller.create(
      dto,
      makeUser() as never,
      makeRequest() as never,
    );

    expect(warmupAccountsService.create).toHaveBeenCalledWith('db_user_1', dto);
    expect(result).toMatchObject({ data: account, serialized: true });
  });

  it('rejects create requests when local DB user id is missing', async () => {
    mockGetPublicMetadata.mockReturnValue({ user: '' });

    await expect(
      controller.create(
        {
          brandName: 'Acme',
          leadEmail: 'lead@example.com',
          organizationName: 'Acme Growth',
        },
        makeUser() as never,
        makeRequest() as never,
      ),
    ).rejects.toThrow('Local user id is required');
  });

  it('serializes list responses with pagination metadata', async () => {
    const account = makeWarmupAccount();
    warmupAccountsService.list.mockResolvedValue([account]);

    const result = await controller.list(makeRequest() as never);

    expect(warmupAccountsService.list).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      data: expect.objectContaining({
        docs: [account],
        totalDocs: 1,
      }),
      serialized: true,
    });
  });

  it('serializes detail responses', async () => {
    const account = makeWarmupAccount();
    warmupAccountsService.get.mockResolvedValue(account);

    const result = await controller.get('warmup_1', makeRequest() as never);

    expect(warmupAccountsService.get).toHaveBeenCalledWith('warmup_1');
    expect(result).toMatchObject({ data: account, serialized: true });
  });
});
