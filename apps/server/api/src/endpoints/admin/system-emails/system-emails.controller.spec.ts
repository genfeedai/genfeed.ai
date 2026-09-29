import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { LIFECYCLE_SYSTEM_EMAILS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemEmailsController } from './system-emails.controller';
import { AdminSystemEmailsService } from './system-emails.service';

describe('SystemEmailsController', () => {
  let controller: SystemEmailsController;

  const mockAdminSystemEmailsService = {
    list: vi.fn(),
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemEmailsController],
      providers: [
        {
          provide: AdminSystemEmailsService,
          useValue: mockAdminSystemEmailsService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    })
      .overrideGuard(IpWhitelistGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<SystemEmailsController>(SystemEmailsController);
  });

  it('lists lifecycle system email definitions', () => {
    mockAdminSystemEmailsService.list.mockReturnValue(LIFECYCLE_SYSTEM_EMAILS);

    expect(controller.list()).toEqual(LIFECYCLE_SYSTEM_EMAILS);
    expect(mockAdminSystemEmailsService.list).toHaveBeenCalledTimes(1);
  });
});
