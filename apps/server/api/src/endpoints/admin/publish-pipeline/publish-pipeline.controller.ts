import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { PublishPipelineQueryDto } from '@api/endpoints/admin/publish-pipeline/dto/publish-pipeline-query.dto';
import { PublishPipelineService } from '@api/endpoints/admin/publish-pipeline/publish-pipeline.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { PublishPipelineSerializer } from '@genfeedai/serializers';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Publish pipeline')
@Controller('admin/publish-pipeline')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class PublishPipelineController {
  constructor(private readonly pipelineService: PublishPipelineService) {}

  @Get()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Read-only: publish approvals created in the window and the posts they approved, with counts by status',
  })
  async getReport(
    @Req() request: Request,
    @Query() query: PublishPipelineQueryDto,
  ) {
    return serializeSingle(
      request,
      PublishPipelineSerializer,
      await this.pipelineService.getReport(query.days),
    );
  }
}
