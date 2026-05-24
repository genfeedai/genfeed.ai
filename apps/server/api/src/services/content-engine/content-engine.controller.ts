import { BulkApproveContentDraftsDto } from '@api/collections/content-drafts/dto/bulk-approve-content-drafts.dto';
import { ContentDraftRejectDto } from '@api/collections/content-drafts/dto/content-draft-action.dto';
import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import { GenerateContentPlanDto } from '@api/collections/content-plans/dto/generate-content-plan.dto';
import { UpdateContentPlanDto } from '@api/collections/content-plans/dto/update-content-plan.dto';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { ContentReviewService } from '@api/services/content-engine/content-review.service';
import type { User } from '@clerk/backend';
import {
  ContentDraftSerializer,
  ContentPlanItemSerializer,
  ContentPlanSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('ContentEngine')
@Controller('brands/:brandId/content')
export class ContentEngineController {
  constructor(
    private readonly contentPlannerService: ContentPlannerService,
    private readonly contentPlansService: ContentPlansService,
    private readonly contentPlanItemsService: ContentPlanItemsService,
    private readonly contentExecutionService: ContentExecutionService,
    private readonly contentReviewService: ContentReviewService,
  ) {}

  // ── Plans ──────────────────────────────────────────────────────────

  @Post('plans')
  async generatePlan(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Body() dto: GenerateContentPlanDto,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);
    const data = await this.contentPlannerService.generatePlan(
      organization,
      brandId,
      userId,
      dto,
    );
    return serializeSingle(req, ContentPlanSerializer, data);
  }

  @Get('plans')
  async listPlans(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const docs = await this.contentPlansService.listByBrand(
      organization,
      brandId,
    );
    return serializeCollection(req, ContentPlanSerializer, { docs });
  }

  @Get('plans/:planId')
  async getPlan(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('planId') planId: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const plan = await this.contentPlansService.getByIdOrFail(
      organization,
      planId,
    );
    const items = await this.contentPlanItemsService.listByPlan(
      organization,
      planId,
    );
    return {
      items: serializeCollection(req, ContentPlanItemSerializer, {
        docs: items,
      }),
      plan: serializeSingle(req, ContentPlanSerializer, plan),
    };
  }

  @Put('plans/:planId')
  async updatePlan(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('planId') planId: string,
    @Body() dto: UpdateContentPlanDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contentPlansService.patch(planId, {
      ...dto,
      organization,
    });
    return serializeSingle(req, ContentPlanSerializer, data);
  }

  @Delete('plans/:planId')
  async deletePlan(@CurrentUser() user: User, @Param('planId') planId: string) {
    const { organization } = getPublicMetadata(user);
    await this.contentPlanItemsService.softDeleteByPlan(organization, planId);
    return this.contentPlansService.softDelete(organization, planId);
  }

  // ── Execution ──────────────────────────────────────────────────────

  @Post('plans/:planId/execute')
  executePlan(
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Param('planId') planId: string,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);
    return this.contentExecutionService.executePlan(
      organization,
      brandId,
      planId,
      userId,
    );
  }

  @Post('plans/:planId/items/:itemId/execute')
  executeItem(
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Param('itemId') itemId: string,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);
    return this.contentExecutionService.executeSingleItem(
      organization,
      brandId,
      userId,
      itemId,
    );
  }

  // ── Review Queue ───────────────────────────────────────────────────

  @Get('queue')
  async getQueue(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
  ) {
    const { organization } = getPublicMetadata(user);
    const docs = await this.contentReviewService.getQueue(
      organization,
      brandId,
    );
    return serializeCollection(req, ContentDraftSerializer, { docs });
  }

  @Put('queue/:draftId/approve')
  async approveDraft(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('draftId') draftId: string,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);
    const data = await this.contentReviewService.approveDraft(
      organization,
      draftId,
      userId,
    );
    return serializeSingle(req, ContentDraftSerializer, data);
  }

  @Put('queue/:draftId/reject')
  async rejectDraft(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('draftId') draftId: string,
    @Body() dto: ContentDraftRejectDto,
  ) {
    const { organization } = getPublicMetadata(user);
    const data = await this.contentReviewService.rejectDraft(
      organization,
      draftId,
      dto.reason,
    );
    return serializeSingle(req, ContentDraftSerializer, data);
  }

  @Post('queue/bulk-approve')
  async bulkApproveDrafts(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Body() dto: BulkApproveContentDraftsDto,
  ) {
    const { organization, user: userId } = getPublicMetadata(user);
    const docs = await this.contentReviewService.bulkApprove(
      organization,
      dto.ids,
      userId,
    );
    return docs;
  }
}
