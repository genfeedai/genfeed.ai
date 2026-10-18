import { AdminPromptsQueryDto } from '@api/collections/prompts/dto/admin-prompts-query.dto';
import { AdminPromptsService } from '@api/collections/prompts/services/admin-prompts.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { PromptSerializer } from '@genfeedai/serializers';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('prompts/admin/without-generation')
@UseGuards(RolesGuard)
export class AdminPromptsController {
  constructor(private readonly adminPrompts: AdminPromptsService) {}

  @Get()
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    summary:
      'List prompts that never produced a generation, across organizations',
  })
  @ApiResponse({ description: 'Prompts returned', status: 200 })
  async list(@Req() request: Request, @Query() query: AdminPromptsQueryDto) {
    return serializeCollection(
      request,
      PromptSerializer,
      await this.adminPrompts.withoutGeneration(query),
    );
  }
}
