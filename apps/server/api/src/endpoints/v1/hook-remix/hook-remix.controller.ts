import {
  CreateBatchHookRemixDto,
  CreateHookRemixDto,
} from '@api/endpoints/v1/hook-remix/dto/create-hook-remix.dto';
import { HookRemixService } from '@api/endpoints/v1/hook-remix/hook-remix.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Hook Remix')
@AutoSwagger()
@Controller('hook-remix')
export class HookRemixController {
  constructor(
    private readonly hookRemixService: HookRemixService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a hook remix job' })
  async createHookRemix(
    @Body() dto: CreateHookRemixDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: userId } = getPublicMetadata(user);

      return await this.hookRemixService.createHookRemix(
        dto,
        userId,
        organization,
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'createHookRemix');
    }
  }

  @Post('batch')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create batch hook remix jobs' })
  async createBatchHookRemix(
    @Body() dto: CreateBatchHookRemixDto,
    @CurrentUser() user: User,
  ) {
    try {
      const { organization, user: userId } = getPublicMetadata(user);

      return await this.hookRemixService.createBatchHookRemix(
        dto,
        userId,
        organization,
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'createBatchHookRemix',
      );
    }
  }

  @Get(':jobId/status')
  @ApiOperation({ summary: 'Get hook remix job status' })
  async getJobStatus(@Param('jobId') jobId: string) {
    try {
      return await this.hookRemixService.getJobStatus(jobId);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getJobStatus');
    }
  }
}
