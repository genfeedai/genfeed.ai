import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CreateBrandRemixRunDto,
  PreparePausedMetaCampaignDraftDto,
  ReviseBrandRemixRunDto,
  StartBrandRemixRunDto,
  SubmitBrandRemixRunForReviewDto,
} from '@api/collections/content-runs/dto/brand-remix-run.dto';
import { CreateContentRunBriefDto } from '@api/collections/content-runs/dto/create-content-run-brief.dto';
import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import { ContentRunRecommendationsService } from '@api/collections/content-runs/services/content-run-recommendations.service';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ActivitySource, ContentRunStatus } from '@genfeedai/enums';
import { ContentRunSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

@Controller()
export class ContentRunsController {
  constructor(
    private readonly contentRunsService: ContentRunsService,
    private readonly recommendationsService: ContentRunRecommendationsService,
    private readonly brandRemixRunsService: BrandRemixRunsService,
  ) {}

  @Get('brands/:brandId/content-runs')
  @ApiQuery({
    enum: ContentRunStatus,
    enumName: 'ContentRunStatus',
    name: 'status',
    required: false,
  })
  async listBrandRuns(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query('skillSlug') skillSlug?: string,
    @Query('status') status?: ContentRunStatus,
  ) {
    const organization = user.organizationId;

    const docs = await this.contentRunsService.listByBrand(
      organization,
      brandId,
      skillSlug,
      status,
    );

    return serializeCollection(req, ContentRunSerializer, { docs });
  }

  @Post('brands/:brandId/content-runs/briefs')
  async createBriefRun(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Body() body: CreateContentRunBriefDto,
  ) {
    const organization = user.organizationId;

    const data = await this.contentRunsService.createBriefRun(
      organization,
      brandId,
      body,
    );

    return serializeSingle(req, ContentRunSerializer, data);
  }

  @Post('brands/:brandId/content-runs/remixes')
  async createBrandRemixRun(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Body() body: CreateBrandRemixRunDto,
  ) {
    const data = await this.brandRemixRunsService.create(
      user.organizationId,
      brandId,
      body,
    );
    return serializeSingle(req, ContentRunSerializer, data);
  }

  @Get('content-runs/:id')
  async getRun(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;

    const data = await this.contentRunsService.getRunById(organization, id);

    return serializeSingle(req, ContentRunSerializer, data);
  }

  @Get('content-runs/:id/remix')
  async getBrandRemixRun(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.brandRemixRunsService.get(user.organizationId, id);
    return serializeSingle(req, ContentRunSerializer, data);
  }

  @Patch('content-runs/:id/remix')
  async reviseBrandRemixRun(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: ReviseBrandRemixRunDto,
  ) {
    const data = await this.brandRemixRunsService.revise(
      user.organizationId,
      id,
      body,
    );
    return serializeSingle(req, ContentRunSerializer, data);
  }

  @Post('content-runs/:id/remix/start')
  @Credits({
    description: 'Brand remix generation',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @UseInterceptors(CreditsInterceptor)
  async startBrandRemixRun(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: StartBrandRemixRunDto,
  ) {
    const data = await this.brandRemixRunsService.start(
      user.organizationId,
      id,
      user,
      req,
      body,
    );
    return serializeSingle(req, ContentRunSerializer, data);
  }

  @Post('content-runs/:id/remix/review')
  async submitBrandRemixRunForReview(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: SubmitBrandRemixRunForReviewDto,
  ) {
    const data = await this.brandRemixRunsService.submitForReview(
      user.organizationId,
      id,
      user.userId ?? user.id,
      body,
    );
    return serializeSingle(req, ContentRunSerializer, data);
  }

  @Post('content-runs/:id/remix/paid-draft')
  async preparePausedMetaCampaignDraft(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: PreparePausedMetaCampaignDraftDto,
  ) {
    const data = await this.brandRemixRunsService.preparePausedMetaDraft(
      user.organizationId,
      id,
      user.userId ?? user.id,
      body,
    );
    return serializeSingle(req, ContentRunSerializer, data);
  }

  @Post('content-runs/:id/recommendations')
  async analyzeRunRecommendations(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;

    const result = await this.recommendationsService.analyzeRun(
      organization,
      id,
    );

    return serializeSingle(req, ContentRunSerializer, result.updatedRun);
  }

  @Post('content-runs/:id/remix-pack')
  async createRemixPack(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;

    const data = await this.contentRunsService.createRemixPack(
      organization,
      id,
    );

    return serializeSingle(req, ContentRunSerializer, data);
  }
}
