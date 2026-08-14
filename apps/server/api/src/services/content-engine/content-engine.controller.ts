import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import { GenerateContentPlanDto } from '@api/collections/content-plans/dto/generate-content-plan.dto';
import { UpdateContentPlanDto } from '@api/collections/content-plans/dto/update-content-plan.dto';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import {
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
  ) {}

  // ── Plans ──────────────────────────────────────────────────────────

  @Post('plans')
  async generatePlan(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
    @Body() dto: GenerateContentPlanDto,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
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
    const organization = user.organizationId;
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
    const organization = user.organizationId;
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
    const organization = user.organizationId;
    const data = await this.contentPlansService.patch(planId, {
      ...dto,
      organizationId: organization,
    });
    return serializeSingle(req, ContentPlanSerializer, data);
  }

  @Delete('plans/:planId')
  async deletePlan(@CurrentUser() user: User, @Param('planId') planId: string) {
    const organization = user.organizationId;
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
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
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
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;
    return this.contentExecutionService.executeSingleItem(
      organization,
      brandId,
      userId,
      itemId,
    );
  }
}
