import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import type { CreditsGuardRequest } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { AssignTurboRunItemDto } from '@api/services/turbo-run/dto/assign-turbo-run-item.dto';
import { CreateManualReviewTurboRunDto } from '@api/services/turbo-run/dto/create-manual-review-turbo-run.dto';
import { CreateTurboRewriteJobDto } from '@api/services/turbo-run/dto/create-turbo-rewrite-job.dto';
import { CreateTurboRunDto } from '@api/services/turbo-run/dto/create-turbo-run.dto';
import {
  TurboRunAction,
  TurboRunActionDto,
} from '@api/services/turbo-run/dto/turbo-run-action.dto';
import { UpdateTurboRunDto } from '@api/services/turbo-run/dto/update-turbo-run.dto';
import { TurboRewriteCreditsGuard } from '@api/services/turbo-run/turbo-rewrite-credits.guard';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import { TurboRunRewriteService } from '@api/services/turbo-run/turbo-run-rewrite.service';
import { TurboRunWorkflowService } from '@api/services/turbo-run/turbo-run-workflow.service';
import { ActivitySource, TurboRunStatus } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { TurboRunSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Turbo runs')
@AutoSwagger()
@FeatureFlag('studio')
@OrganizationModule('turbo')
@Controller('turbo-runs')
@UseGuards(RolesGuard)
export class TurboRunController {
  constructor(
    private readonly turboRunService: TurboRunService,
    private readonly turboRunWorkflowService: TurboRunWorkflowService,
    private readonly loggerService: LoggerService,
    private readonly rewriteService: TurboRunRewriteService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new Turbo run job' })
  async createTurboRun(
    @Req() req: Request,
    @Body() dto: CreateTurboRunDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = user.organizationId;
      const userId = user.userId ?? user.id;

      const data = await this.turboRunService.createTurboRun(
        dto,
        userId,
        organization,
      );
      return serializeSingle(req, TurboRunSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'createTurboRun');
    }
  }

  @Post('manual-review')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a manual review run from existing assets',
  })
  async createManualReviewTurboRun(
    @Req() req: Request,
    @Body() dto: CreateManualReviewTurboRunDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = user.organizationId;
      const userId = user.userId ?? user.id;

      const data = await this.turboRunService.createManualReviewTurboRun(
        dto,
        userId,
        organization,
      );
      return serializeSingle(req, TurboRunSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'createManualReviewTurboRun',
      );
    }
  }

  @TenantReadPolicy('selected')
  @Get()
  @ApiOperation({ summary: 'List runs for organization' })
  @ApiQuery({
    enum: TurboRunStatus,
    enumName: 'TurboRunStatus',
    name: 'status',
    required: false,
  })
  async getTurboRuns(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('status') status?: TurboRunStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      const organization = resolveTenantReadScope(user).organizationId;

      const data = await this.turboRunService.getTurboRuns(organization, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
        status,
      });
      return serializeCollection(req, TurboRunSerializer, {
        docs: data.items,
        total: data.total,
      });
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getTurboRuns');
    }
  }

  @TenantReadPolicy('selected')
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific run' })
  async getTurboRun(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = resolveTenantReadScope(user).organizationId;

      const data = await this.turboRunService.getTurboRun(id, organization);
      return serializeSingle(req, TurboRunSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getTurboRun');
    }
  }

  @Post(':id/process')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trigger run processing' })
  async processTurboRun(@Param('id') id: string, @CurrentUser() user: User) {
    try {
      const organization = user.organizationId;

      const jobId = await this.turboRunWorkflowService.queueTurboRun(
        {
          turboRunId: id,
          organizationId: organization,
          userId: user.userId ?? user.id,
        },
        SystemWorkflowDispatchClass.INTERACTIVE,
      );
      return { jobId, status: 'queued' };
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'processTurboRun');
    }
  }

  @Post(':id/rewrite-jobs')
  @HttpCode(202)
  @UseGuards(TurboRewriteCreditsGuard)
  @ApiOperation({
    summary: 'Queue a background rewrite of selected Turbo run items',
  })
  async createRewriteJob(
    @Req() req: Request & Pick<CreditsGuardRequest, 'creditsConfig'>,
    @Param('id') id: string,
    @Body() dto: CreateTurboRewriteJobDto,
    @CurrentUser() user: User,
  ) {
    try {
      const itemCount = new Set(dto.itemIds).size;
      const creditsConfig = req.creditsConfig;
      return await this.rewriteService.enqueue({
        turboRunId: id,
        credits: {
          amountPerItem: (creditsConfig?.amount ?? 0) / itemCount,
          description: creditsConfig?.description ?? 'Turbo rewrite',
          source: creditsConfig?.source ?? ActivitySource.POST_ENHANCEMENT,
        },
        itemIds: dto.itemIds,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      });
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'createRewriteJob',
      );
    }
  }

  @Get(':id/rewrite-jobs/active')
  @ApiOperation({ summary: 'Get the queued or running rewrite of a run' })
  async getActiveRewriteJob(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      return {
        job: await this.rewriteService.getActiveJob(id, user.organizationId),
      };
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getActiveRewriteJob',
      );
    }
  }

  @Get(':id/rewrite-jobs/:jobId')
  @ApiOperation({ summary: 'Get the progress of a Turbo rewrite' })
  async getRewriteJob(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: User,
  ) {
    try {
      return await this.rewriteService.getJob(id, jobId, user.organizationId);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getRewriteJob');
    }
  }

  @Post(':id/rewrite-jobs/:jobId/cancel')
  @OrganizationModule('turbo', 'read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stop a Turbo rewrite before its next item' })
  async cancelRewriteJob(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: User,
  ) {
    try {
      return await this.rewriteService.cancel(id, jobId, user.organizationId);
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'cancelRewriteJob',
      );
    }
  }

  @Post(':id/items/action')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve, reject, or request changes on Turbo run items',
  })
  async itemAction(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: TurboRunActionDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = user.organizationId;
      const userId = user.userId ?? user.id;

      let data: unknown;
      if (dto.action === TurboRunAction.APPROVE) {
        data = await this.turboRunService.approveItems(
          id,
          dto.itemIds,
          organization,
          userId,
        );
      } else if (dto.action === TurboRunAction.REQUEST_CHANGES) {
        data = await this.turboRunService.requestChanges(
          id,
          dto.itemIds,
          organization,
          dto.feedback,
          userId,
        );
      } else {
        data = await this.turboRunService.rejectItems(
          id,
          dto.itemIds,
          organization,
          dto.feedback,
          userId,
        );
      }
      return serializeSingle(req, TurboRunSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'itemAction');
    }
  }

  @Post(':id/items/:itemId/assign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Assign a review item to a team member' })
  async assignItem(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: AssignTurboRunItemDto,
    @CurrentUser() user: User,
  ) {
    try {
      const data = await this.turboRunService.assignItem(
        id,
        itemId,
        dto.assigneeId,
        user.organizationId,
      );
      return serializeSingle(req, TurboRunSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'assignItem');
    }
  }

  @Post(':id/items/:itemId/unassign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Clear assignment on a review item' })
  async unassignItem(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: User,
  ) {
    try {
      const data = await this.turboRunService.unassignItem(
        id,
        itemId,
        user.organizationId,
      );
      return serializeSingle(req, TurboRunSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'unassignItem');
    }
  }

  @Patch(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update a run (e.g. cancel via status)' })
  async patch(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateTurboRunDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = user.organizationId;

      const data = await this.turboRunService.updateTurboRun(
        id,
        dto,
        organization,
      );
      return serializeSingle(req, TurboRunSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'patch');
    }
  }
}
