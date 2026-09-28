import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AcceptBatchProjectQuoteDto } from '@api/collections/batch-projects/dto/accept-batch-project-quote.dto';
import { AddBatchProjectItemsDto } from '@api/collections/batch-projects/dto/add-batch-project-items.dto';
import { CreateBatchProjectDto } from '@api/collections/batch-projects/dto/create-batch-project.dto';
import { GenerateBatchIdeasDto } from '@api/collections/batch-projects/dto/generate-batch-ideas.dto';
import { QuoteBatchProjectDto } from '@api/collections/batch-projects/dto/quote-batch-project.dto';
import { ReviewBatchProjectItemsDto } from '@api/collections/batch-projects/dto/review-batch-project-items.dto';
import { ScheduleBatchProjectDto } from '@api/collections/batch-projects/dto/schedule-batch-project.dto';
import { UpdateBatchProjectDto } from '@api/collections/batch-projects/dto/update-batch-project.dto';
import { UpdateBatchProjectItemDto } from '@api/collections/batch-projects/dto/update-batch-project-item.dto';
import { BatchProjectSchedulingService } from '@api/collections/batch-projects/services/batch-project-scheduling.service';
import { BatchProjectsService } from '@api/collections/batch-projects/services/batch-projects.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { assertApiKeyPublishingScope } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import type { IBatchProjectScope } from '@genfeedai/contracts/interfaces';
import { BatchProjectSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/** Batch projects produce review drafts, so writing one is a draft action. */
const BATCH_PROJECT_WRITE_SCOPES = [
  ApiKeyScope.POSTS_DRAFT,
  ApiKeyScope.POSTS_CREATE,
] as const;

@AutoSwagger()
@ApiTags('BatchProjects')
@Controller('batch-projects')
@UseGuards(RolesGuard, SubscriptionGuard)
export class BatchProjectsController {
  constructor(
    private readonly batchProjectsService: BatchProjectsService,
    private readonly batchProjectSchedulingService: BatchProjectSchedulingService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ) {
    const result = await this.batchProjectsService.list(
      this.requireScope(user),
      query,
    );
    return serializeCollection(request, BatchProjectSerializer, result);
  }

  @Post()
  @RequiredScopes(...BATCH_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreateBatchProjectDto,
  ) {
    const project = await this.batchProjectsService.create(
      body,
      this.requireScope(user),
    );
    return serializeSingle(request, BatchProjectSerializer, project);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const project = await this.batchProjectsService.findOne(
      id,
      this.requireScope(user),
    );
    return serializeSingle(request, BatchProjectSerializer, project);
  }

  @Patch(':id')
  @RequiredScopes(...BATCH_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateBatchProjectDto,
  ) {
    const project = await this.batchProjectsService.update(
      id,
      body,
      this.requireScope(user),
    );
    return serializeSingle(request, BatchProjectSerializer, project);
  }

  @Delete(':id')
  @RequiredScopes(...BATCH_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    await this.batchProjectsService.remove(id, this.requireScope(user));
    return { success: true };
  }

  @Post(':id/items')
  @RequiredScopes(...BATCH_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async addItems(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: AddBatchProjectItemsDto,
  ) {
    const project = await this.batchProjectsService.addItems(
      id,
      body,
      this.requireScope(user),
    );
    return serializeSingle(request, BatchProjectSerializer, project);
  }

  @Patch(':id/items/:itemId')
  @RequiredScopes(...BATCH_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateItem(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateBatchProjectItemDto,
  ) {
    const project = await this.batchProjectsService.updateItem(
      id,
      itemId,
      body,
      this.requireScope(user),
    );
    return serializeSingle(request, BatchProjectSerializer, project);
  }

  @Delete(':id/items/:itemId')
  @RequiredScopes(...BATCH_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async removeItem(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    const project = await this.batchProjectsService.removeItem(
      id,
      itemId,
      this.requireScope(user),
    );
    return serializeSingle(request, BatchProjectSerializer, project);
  }

  @Post(':id/ideas')
  @FeatureFlag('batch_ideas')
  @RequiredScopes(...BATCH_PROJECT_WRITE_SCOPES)
  async generateIdeas(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: GenerateBatchIdeasDto,
  ) {
    const project = await this.batchProjectsService.generateIdeas(
      id,
      body,
      this.requireScope(user),
    );
    return serializeSingle(request, BatchProjectSerializer, project);
  }

  @Post(':id/quote')
  @RequiredScopes(...BATCH_PROJECT_WRITE_SCOPES)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async quote(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: QuoteBatchProjectDto,
  ) {
    return {
      data: await this.batchProjectsService.quote(
        id,
        body,
        this.requireScope(user),
      ),
    };
  }

  @Post(':id/start')
  @RequiredScopes(...BATCH_PROJECT_WRITE_SCOPES)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async start(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: AcceptBatchProjectQuoteDto,
  ) {
    const project = await this.batchProjectsService.start(
      id,
      this.requireScope(user),
      body.quoteId,
    );
    return serializeSingle(request, BatchProjectSerializer, project);
  }

  @Post(':id/items/:itemId/retry')
  @RequiredScopes(...BATCH_PROJECT_WRITE_SCOPES)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async retryItem(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: AcceptBatchProjectQuoteDto,
  ) {
    const project = await this.batchProjectsService.retryItem(
      id,
      itemId,
      this.requireScope(user),
      body.quoteId,
    );
    return serializeSingle(request, BatchProjectSerializer, project);
  }

  @Post(':id/review')
  @RequiredScopes(ApiKeyScope.POSTS_APPROVE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async review(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: ReviewBatchProjectItemsDto,
  ) {
    assertApiKeyPublishingScope(user, 'approve');
    const project = await this.batchProjectsService.review(
      id,
      body,
      this.requireScope(user),
    );
    return serializeSingle(request, BatchProjectSerializer, project);
  }

  @Post(':id/schedule')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE, ApiKeyScope.POSTS_PUBLISH)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async schedule(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: ScheduleBatchProjectDto,
  ) {
    // A destination without a date, or with one already due, publishes now,
    // which needs publish scope.
    const now = Date.now();
    const isDueNow = (scheduledDate?: string) =>
      !scheduledDate || Date.parse(scheduledDate) <= now;
    if (body.targets.some((target) => !isDueNow(target.scheduledDate))) {
      assertApiKeyPublishingScope(user, 'schedule');
    }
    if (body.targets.some((target) => isDueNow(target.scheduledDate))) {
      assertApiKeyPublishingScope(user, 'publish');
    }
    return this.batchProjectSchedulingService.schedule(
      id,
      body,
      this.requireScope(user),
    );
  }

  private requireScope(user: User): IBatchProjectScope {
    const organizationId = user.organizationId;
    const userId = user.userId ?? user.id;
    if (!organizationId || !userId) {
      throw new BadRequestException(
        'Organization and user context are required',
      );
    }
    return {
      ...(user.brandId ? { brandId: user.brandId } : {}),
      organizationId,
      userId,
    };
  }
}
