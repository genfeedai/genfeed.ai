import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WarmupAccountsController } from './warmup-accounts.controller';
import { AdminWarmupAccountsService } from './warmup-accounts.service';

vi.mock('@api/helpers/decorators/user/current-user.decorator', () => ({
  CurrentUser:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
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

vi.mock('@genfeedai/serializers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/serializers')>();
  return {
    ...actual,
    WarmupAccountSerializer: {},
  };
});

const makeRequest = () => ({
  url: 'https://api.genfeed.ai/admin/warmup-accounts',
});

const makeUser = () => ({
  id: 'auth_provider_user_1',
  isSuperAdmin: false,
  userId: 'db_user_1',
});

const makeWarmupAccount = () => ({
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
    inspectInvitation: vi.fn(),
    list: vi.fn(),
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    sendInvitation: vi.fn(),
  };

  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

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
      .overrideGuard(IpWhitelistGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
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
    await expect(
      controller.create(
        {
          brandName: 'Acme',
          leadEmail: 'lead@example.com',
          organizationName: 'Acme Growth',
        },
        { id: '', userId: '' } as never,
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

  it('declares invitation lifecycle routes before the :id wildcard', () => {
    const routes = (
      [
        'inspectInvitation',
        'sendInvitation',
        'resendInvitation',
        'revokeInvitation',
        'get',
      ] as const
    ).map((handler) => ({
      handler,
      method: Reflect.getMetadata(
        METHOD_METADATA,
        WarmupAccountsController.prototype[handler],
      ),
      path: Reflect.getMetadata(
        PATH_METADATA,
        WarmupAccountsController.prototype[handler],
      ),
    }));

    expect(routes).toEqual([
      {
        handler: 'inspectInvitation',
        method: RequestMethod.GET,
        path: ':id/invitation',
      },
      {
        handler: 'sendInvitation',
        method: RequestMethod.POST,
        path: ':id/invitation/send',
      },
      {
        handler: 'resendInvitation',
        method: RequestMethod.POST,
        path: ':id/invitation/resend',
      },
      {
        handler: 'revokeInvitation',
        method: RequestMethod.POST,
        path: ':id/invitation/revoke',
      },
      {
        handler: 'get',
        method: RequestMethod.GET,
        path: ':id',
      },
    ]);
  });

  it('inspects invitation lifecycle state through the serializer', async () => {
    const account = makeWarmupAccount();
    warmupAccountsService.inspectInvitation.mockResolvedValue(account);

    const result = await controller.inspectInvitation(
      'warmup_1',
      makeRequest() as never,
    );

    expect(warmupAccountsService.inspectInvitation).toHaveBeenCalledWith(
      'warmup_1',
    );
    expect(result).toMatchObject({ data: account, serialized: true });
  });

  it('sends invitations with the local DB user id', async () => {
    const account = makeWarmupAccount();
    warmupAccountsService.sendInvitation.mockResolvedValue(account);

    const result = await controller.sendInvitation(
      'warmup_1',
      makeUser() as never,
      makeRequest() as never,
    );

    expect(warmupAccountsService.sendInvitation).toHaveBeenCalledWith(
      'warmup_1',
      'db_user_1',
    );
    expect(result).toMatchObject({ data: account, serialized: true });
  });

  it('rejects send, resend, and revoke when local DB user id is missing', async () => {
    const user = { id: '', userId: '' } as never;
    const request = makeRequest() as never;

    await expect(
      controller.sendInvitation('warmup_1', user, request),
    ).rejects.toThrow('Local user id is required');
    await expect(
      controller.resendInvitation('warmup_1', user, request),
    ).rejects.toThrow('Local user id is required');
    await expect(
      controller.revokeInvitation('warmup_1', user, request),
    ).rejects.toThrow('Local user id is required');
  });

  it('resends and revokes invitations with the acting operator id', async () => {
    const account = makeWarmupAccount();
    warmupAccountsService.resendInvitation.mockResolvedValue(account);
    warmupAccountsService.revokeInvitation.mockResolvedValue(account);

    await controller.resendInvitation(
      'warmup_1',
      makeUser() as never,
      makeRequest() as never,
    );
    await controller.revokeInvitation(
      'warmup_1',
      makeUser() as never,
      makeRequest() as never,
    );

    expect(warmupAccountsService.resendInvitation).toHaveBeenCalledWith(
      'warmup_1',
      'db_user_1',
    );
    expect(warmupAccountsService.revokeInvitation).toHaveBeenCalledWith(
      'warmup_1',
      'db_user_1',
    );
  });
});
