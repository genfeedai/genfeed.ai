import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CreateBrandRemixRunDto,
  PreparePausedMetaCampaignDraftDto,
  ReviseBrandRemixRunDto,
  StartBrandRemixRunDto,
  SubmitBrandRemixRunForReviewDto,
} from '@api/collections/content-runs/dto/brand-remix-run.dto';
import {
  AttachBrandRemixAnalysisSourceDto,
  ControlBrandRemixScenesDto,
  ExecuteBrandRemixScenesDto,
  QuoteBrandRemixScenesDto,
} from '@api/collections/content-runs/dto/brand-remix-scene.dto';
import { CreateContentRunBriefDto } from '@api/collections/content-runs/dto/create-content-run-brief.dto';
import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import { BrandRemixSceneService } from '@api/collections/content-runs/services/brand-remix-scene.service';
import { ContentRunRecommendationsService } from '@api/collections/content-runs/services/content-run-recommendations.service';
import { ContentRunsService } from '@api/collections/content-runs/services/content-runs.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ActivitySource, ContentRunStatus } from '@genfeedai/contracts';
import {
  BrandRemixRunSummarySerializer,
  ContentRunSerializer,
} from '@genfeedai/serializers';
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
@OrganizationModule('playground')
export class ContentRunsController {
  constructor(
    private readonly contentRunsService: ContentRunsService,
    private readonly recommendationsService: ContentRunRecommendationsService,
    private readonly brandRemixScenes: BrandRemixSceneService,
    private readonly brandRemixRunsService: BrandRemixRunsService,
  ) {}

  @Patch('content-runs/:id/remix/scenes/source')
  async attachSceneSource(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: AttachBrandRemixAnalysisSourceDto,
  ) {
    return serializeSingle(
      req,
      ContentRunSerializer,
      await this.brandRemixScenes.attachSource(
        user.organizationId,
        id,
        user,
        body,
      ),
    );
  }
  @Post('content-runs/:id/remix/scenes/quote')
  async quoteScenes(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: QuoteBrandRemixScenesDto,
  ) {
    return serializeSingle(
      req,
      ContentRunSerializer,
      await this.brandRemixScenes.quote(user.organizationId, id, user, body),
    );
  }
  @Post('content-runs/:id/remix/scenes/execute')
  @UseGuards(CreditsGuard)
  @DeferCreditsUntilModelResolution()
  async executeScenes(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: ExecuteBrandRemixScenesDto,
  ) {
    return serializeSingle(
      req,
      ContentRunSerializer,
      await this.brandRemixScenes.execute(
        user.organizationId,
        id,
        user,
        req,
        body,
      ),
    );
  }
  @OrganizationModule('playground', 'cancel')
  @Post('content-runs/:id/remix/scenes/cancel')
  async cancelScenes(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: ControlBrandRemixScenesDto,
  ) {
    return serializeSingle(
      req,
      ContentRunSerializer,
      await this.brandRemixScenes.cancel(user.organizationId, id, body),
    );
  }
  @Post('content-runs/:id/remix/scenes/resume')
  @UseGuards(CreditsGuard)
  @DeferCreditsUntilModelResolution()
  async resumeScenes(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: ControlBrandRemixScenesDto,
  ) {
    return serializeSingle(
      req,
      ContentRunSerializer,
      await this.brandRemixScenes.resume(user.organizationId, id, user, body),
    );
  }

  @TenantReadPolicy('selected')
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
    const organization = resolveTenantReadScope(user).organizationId;

    const docs = await this.contentRunsService.listByBrand(
      organization,
      brandId,
      skillSlug,
      status,
    );

    return serializeCollection(req, ContentRunSerializer, { docs });
  }

  @Get('brands/:brandId/content-runs/remixes')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listBrandRemixRuns(
    @Req() req: Request,
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
    @Query() query: Record<string, string>,
  ) {
    const docs = await this.brandRemixRunsService.list(
      user.organizationId,
      brandId,
      query,
    );
    return serializeCollection(req, BrandRemixRunSummarySerializer, { docs });
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
      user.userId,
    );
    return serializeSingle(req, ContentRunSerializer, data);
  }

  @TenantReadPolicy('selected')
  @Get('content-runs/:id')
  async getRun(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const organization = resolveTenantReadScope(user).organizationId;

    const data = await this.contentRunsService.getRunById(organization, id);

    return serializeSingle(req, ContentRunSerializer, data);
  }

  @TenantReadPolicy('mutating')
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
  @UseGuards(CreditsGuard)
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

  @OrganizationModule('publishing')
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
