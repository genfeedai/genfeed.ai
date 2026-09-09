import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { EmailPerformanceQueryDto } from '@api/endpoints/admin/system-emails/dto/email-performance-query.dto';
import { AdminSystemEmailsService } from '@api/endpoints/admin/system-emails/system-emails.service';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { LifecycleSystemEmailDefinition } from '@genfeedai/contracts/constants';
import { EmailPerformanceSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / System Emails')
@Controller('admin/system-emails')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class SystemEmailsController {
  constructor(
    private readonly adminSystemEmailsService: AdminSystemEmailsService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get('performance')
  @ApiOperation({
    summary: 'Report unique email outcomes by queued message cohort',
  })
  async performance(
    @Req() request: Request,
    @Query() query: EmailPerformanceQueryDto,
  ) {
    try {
      const report = await this.adminSystemEmailsService.getPerformance(query);
      return serializeSingle(request, EmailPerformanceSerializer, {
        ...report,
      });
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getSystemEmailPerformance',
      );
    }
  }

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
      );
    }
  }
}
