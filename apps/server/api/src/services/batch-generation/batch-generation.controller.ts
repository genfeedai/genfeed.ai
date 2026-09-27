import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import type { CreditsGuardRequest } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { BatchGenerationRewriteService } from '@api/services/batch-generation/batch-generation-rewrite.service';
import { BatchGenerationWorkflowService } from '@api/services/batch-generation/batch-generation-workflow.service';
import { BatchRewriteCreditsGuard } from '@api/services/batch-generation/batch-rewrite-credits.guard';
import { AssignBatchItemDto } from '@api/services/batch-generation/dto/assign-batch-item.dto';
import {
  BatchAction,
  BatchActionDto,
} from '@api/services/batch-generation/dto/batch-action.dto';
import { CreateBatchDto } from '@api/services/batch-generation/dto/create-batch.dto';
import { CreateBatchRewriteJobDto } from '@api/services/batch-generation/dto/create-batch-rewrite-job.dto';
import { CreateManualReviewBatchDto } from '@api/services/batch-generation/dto/create-manual-review-batch.dto';
import { UpdateBatchDto } from '@api/services/batch-generation/dto/update-batch.dto';
import { ActivitySource, BatchStatus } from '@genfeedai/contracts';
import { BatchSerializer } from '@genfeedai/serializers';
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

@ApiTags('Batches')
@AutoSwagger()
@Controller('batches')
@UseGuards(RolesGuard, SubscriptionGuard)
export class BatchGenerationController {
  constructor(
    private readonly batchGenerationService: BatchGenerationService,
    private readonly batchGenerationWorkflowService: BatchGenerationWorkflowService,
    private readonly loggerService: LoggerService,
    private readonly rewriteService: BatchGenerationRewriteService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new batch generation job' })
  async createBatch(
    @Req() req: Request,
    @Body() dto: CreateBatchDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = user.organizationId;
      const userId = user.userId ?? user.id;

      const data = await this.batchGenerationService.createBatch(
        dto,
        userId,
        organization,
      );
      return serializeSingle(req, BatchSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'createBatch');
    }
  }

  @Post('manual-review')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a manual review batch from existing assets',
  })
  async createManualReviewBatch(
    @Req() req: Request,
    @Body() dto: CreateManualReviewBatchDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = user.organizationId;
      const userId = user.userId ?? user.id;

      const data = await this.batchGenerationService.createManualReviewBatch(
        dto,
        userId,
        organization,
      );
      return serializeSingle(req, BatchSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'createManualReviewBatch',
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'List batches for organization' })
  @ApiQuery({
    enum: BatchStatus,
    enumName: 'BatchStatus',
    name: 'status',
    required: false,
  })
  async getBatches(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('status') status?: BatchStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      const organization = user.organizationId;

      const data = await this.batchGenerationService.getBatches(organization, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
        status,
      });
      return serializeCollection(req, BatchSerializer, {
        docs: data.items,
        total: data.total,
      });
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getBatches');
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific batch' })
  async getBatch(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = user.organizationId;

      const data = await this.batchGenerationService.getBatch(id, organization);
      return serializeSingle(req, BatchSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'getBatch');
    }
  }

  @Post(':id/process')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trigger batch processing' })
  async processBatch(@Param('id') id: string, @CurrentUser() user: User) {
    try {
      const organization = user.organizationId;

      const jobId = await this.batchGenerationWorkflowService.queueBatch({
        batchId: id,
        organizationId: organization,
        userId: user.userId ?? user.id,
      });
      return { jobId, status: 'queued' };
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'processBatch');
    }
  }

  @Post(':id/rewrite-jobs')
  @HttpCode(202)
  @UseGuards(BatchRewriteCreditsGuard)
  @ApiOperation({
    summary: 'Queue a background rewrite of selected batch items',
  })
  async createRewriteJob(
    @Req() req: Request & Pick<CreditsGuardRequest, 'creditsConfig'>,
    @Param('id') id: string,
    @Body() dto: CreateBatchRewriteJobDto,
    @CurrentUser() user: User,
  ) {
    try {
      const itemCount = new Set(dto.itemIds).size;
      const creditsConfig = req.creditsConfig;
      return await this.rewriteService.enqueue({
        batchId: id,
        credits: {
          amountPerItem: (creditsConfig?.amount ?? 0) / itemCount,
          description: creditsConfig?.description ?? 'Batch rewrite',
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
  @ApiOperation({ summary: 'Get the queued or running rewrite of a batch' })
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
  @ApiOperation({ summary: 'Get the progress of a batch rewrite' })
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
  @HttpCode(200)
  @ApiOperation({ summary: 'Stop a batch rewrite before its next item' })
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
    summary: 'Approve, reject, or request changes on batch items',
  })
  async itemAction(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: BatchActionDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = user.organizationId;
      const userId = user.userId ?? user.id;

      let data: unknown;
      if (dto.action === BatchAction.APPROVE) {
        data = await this.batchGenerationService.approveItems(
          id,
          dto.itemIds,
          organization,
          userId,
        );
      } else if (dto.action === BatchAction.REQUEST_CHANGES) {
        data = await this.batchGenerationService.requestChanges(
          id,
          dto.itemIds,
          organization,
          dto.feedback,
          userId,
        );
      } else {
        data = await this.batchGenerationService.rejectItems(
          id,
          dto.itemIds,
          organization,
          dto.feedback,
          userId,
        );
      }
      return serializeSingle(req, BatchSerializer, data);
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
    @Body() dto: AssignBatchItemDto,
    @CurrentUser() user: User,
  ) {
    try {
      const data = await this.batchGenerationService.assignItem(
        id,
        itemId,
        dto.assigneeId,
        user.organizationId,
      );
      return serializeSingle(req, BatchSerializer, data);
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
      const data = await this.batchGenerationService.unassignItem(
        id,
        itemId,
        user.organizationId,
      );
      return serializeSingle(req, BatchSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'unassignItem');
    }
  }

  @Patch(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update a batch (e.g. cancel via status)' })
  async patch(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateBatchDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organization = user.organizationId;

      const data = await this.batchGenerationService.updateBatch(
        id,
        dto,
        organization,
      );
      return serializeSingle(req, BatchSerializer, data);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'patch');
    }
  }
}
