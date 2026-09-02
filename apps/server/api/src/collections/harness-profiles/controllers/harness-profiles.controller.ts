import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PromoteWinnersDto } from '@api/collections/harness-profiles/dto/promote-winners.dto';
import { UpdateHarnessProfileDto } from '@api/collections/harness-profiles/dto/update-harness-profile.dto';
import { UpsertHarnessProfileDto } from '@api/collections/harness-profiles/dto/upsert-harness-profile.dto';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { AUTOMATION_WORKFLOW_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { HarnessProfileSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Harness Profiles')
@Controller('harness-profiles')
export class HarnessProfilesController {
  constructor(
    private readonly harnessProfilesService: HarnessProfilesService,
    @Optional()
    private readonly systemWorkflowRunner?: SystemWorkflowRunnerService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findForBrand(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('brandId') brandId: string,
    @Query('isActive') isActive?: string,
  ) {
    const organization = user.organizationId;
    if (!brandId?.trim()) {
      throw new BadRequestException('brandId query parameter is required');
    }

    const docs = await this.harnessProfilesService.findForBrand(
      organization,
      brandId,
      { isActive: isActive ? isActive === 'true' : undefined },
    );

    return serializeCollection(request, HarnessProfileSerializer, { docs });
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: UpsertHarnessProfileDto,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
    const profile = await this.harnessProfilesService.create(
      dto,
      organization,
      userId,
    );

    return serializeSingle(request, HarnessProfileSerializer, profile);
  }

  /**
   * Promote this week's top-performing posts into the brand's harness
   * performance-winners context base (structured entries, not a RAG product).
   * The endpoint is an entry surface only: discovery and promotion run as the
   * immutable `harness.winners.promote.brand` system workflow.
   */
  @Post('promote-winners')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async promoteWinners(
    @CurrentUser() user: User,
    @Body() dto: PromoteWinnersDto,
  ) {
    const organization = user.organizationId;
    if (!dto.brandId?.trim()) {
      throw new BadRequestException('brandId is required');
    }

    const runner = this.resolveSystemWorkflowRunner();
    if (!runner) {
      throw new ServiceUnavailableException(
        'Harness winner promotion is unavailable',
      );
    }
    const { result } = await runner.runWorkflow<{
      brandId?: string;
      promoted: number;
      skipped: number;
      status: string;
    }>({
      actionType: AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS_BRAND,
      canonicalId: AUTOMATION_WORKFLOW_IDS.HARNESS_WINNERS_BRAND,
      inputValues: {
        item: dto.brandId,
        ...(dto.limit === undefined ? {} : { limit: dto.limit }),
        organizationId: organization,
        ...(dto.platform ? { platform: dto.platform } : {}),
      },
      organizationId: organization,
      source: 'api:harness-profiles.promote-winners',
      trigger: WorkflowExecutionTrigger.API,
      userId: user.userId ?? user.id,
    });
    return result;
  }

  private resolveSystemWorkflowRunner():
    | SystemWorkflowRunnerService
    | undefined {
    if (this.systemWorkflowRunner) {
      return this.systemWorkflowRunner;
    }
    try {
      return this.moduleRef?.get(SystemWorkflowRunnerService, {
        strict: false,
      });
    } catch {
      return undefined;
    }
  }

  @Patch(':profileId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateHarnessProfileDto,
  ) {
    const organization = user.organizationId;
    const profile = await this.harnessProfilesService.update(
      profileId,
      dto,
      organization,
    );

    return serializeSingle(request, HarnessProfileSerializer, profile);
  }

  @Delete(':profileId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @CurrentUser() user: User,
    @Param('profileId') profileId: string,
  ) {
    const organization = user.organizationId;
    await this.harnessProfilesService.remove(profileId, organization);
    return { message: 'Harness profile deleted successfully' };
  }
}
