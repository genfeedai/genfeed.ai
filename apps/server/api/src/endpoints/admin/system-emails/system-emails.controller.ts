import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminSystemEmailsService } from '@api/endpoints/admin/system-emails/system-emails.service';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import type { LifecycleSystemEmailDefinition } from '@genfeedai/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Admin / System Emails')
@Controller('admin/system-emails')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class SystemEmailsController {
  constructor(
    private readonly adminSystemEmailsService: AdminSystemEmailsService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List platform-owned lifecycle system emails' })
  list(): LifecycleSystemEmailDefinition[] {
    try {
      return this.adminSystemEmailsService.list();
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'listSystemEmails',
      ) as never;
    }
  }
}
