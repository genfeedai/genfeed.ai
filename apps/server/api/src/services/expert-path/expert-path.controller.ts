import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ReviewFirstSystemItemDto } from '@api/services/expert-path/dto/review-first-system-item.dto';
import { ExpertFirstSystemService } from '@api/services/expert-path/services/expert-first-system.service';
import { ExpertPathService } from '@api/services/expert-path/services/expert-path.service';
import { ExpertPositioningService } from '@api/services/expert-path/services/expert-positioning.service';
import type { IExpertPathStatus } from '@genfeedai/contracts/interfaces';
import {
  ContentPlanItemSerializer,
  ContentPlanSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Expert Path surface for a brand: status, positioning regeneration, and the
 * first content system with per-item review.
 */
@AutoSwagger()
@Controller('brands/:brandId/expert-path')
export class ExpertPathController {
  constructor(
    private readonly expertPathService: ExpertPathService,
    private readonly expertPositioningService: ExpertPositioningService,
    private readonly expertFirstSystemService: ExpertFirstSystemService,
  ) {}

  @Get()
  getStatus(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ): Promise<IExpertPathStatus> {
    return this.expertPathService.getStatus(this.requireOrg(user), brandId);
  }

  /** Re-score stored positioning answers and refresh the harness draft. */
  @Post('positioning/profile')
  async regeneratePositioning(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ) {
    const { profile, score } =
      await this.expertPositioningService.generateDraft({
        brandId,
        organizationId: this.requireOrg(user),
        userId: this.requireUser(user),
      });
    return { harnessProfileId: profile.id, score };
  }

  @Post('first-system')
  async generateFirstSystem(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ) {
    const { items, plan, provenance } =
      await this.expertFirstSystemService.generate({
        brandId,
        organizationId: this.requireOrg(user),
        userId: this.requireUser(user),
      });
    return {
      items: serializeCollection(req, ContentPlanItemSerializer, {
        docs: items,
      }),
      plan: serializeSingle(req, ContentPlanSerializer, plan),
      provenance,
    };
  }

  /** The current first content system plan and its items, for review. */
  @Get('first-system')
  async getFirstSystem(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ) {
    const result = await this.expertFirstSystemService.getCurrentPlan(
      this.requireOrg(user),
      brandId,
    );
    if (!result) {
      return { items: null, plan: null };
    }
    return {
      items: serializeCollection(req, ContentPlanItemSerializer, {
        docs: result.items,
      }),
      plan: serializeSingle(req, ContentPlanSerializer, result.plan),
    };
  }

  @Patch('first-system/:planId/items/:itemId')
  async reviewFirstSystemItem(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @Param('planId') planId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ReviewFirstSystemItemDto,
    @CurrentUser() user: User,
  ) {
    const { item } = await this.expertFirstSystemService.applyItemAction({
      action: dto.action,
      brandId,
      itemId,
      organizationId: this.requireOrg(user),
      planId,
      ...(dto.prompt !== undefined ? { prompt: dto.prompt } : {}),
      ...(dto.topic !== undefined ? { topic: dto.topic } : {}),
      userId: this.requireUser(user),
    });
    return serializeSingle(req, ContentPlanItemSerializer, item);
  }

  private requireOrg(user: User): string {
    const organizationId = user.organizationId?.toString();
    if (!organizationId) {
      throw new ForbiddenException('Organization context is required');
    }
    return organizationId;
  }

  private requireUser(user: User): string {
    const userId = (user.userId ?? user.id)?.toString();
    if (!userId) {
      throw new ForbiddenException('User context is required');
    }
    return userId;
  }
}
