import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type {
  TrendPromptReferencePackType,
  TrendSourceIntendedUse,
  TrendSourceKind,
} from '@api/collections/trends/interfaces/trend.interfaces';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

const TREND_SOURCE_KIND_VALUES = [
  'manual_curated_reference',
  'owned_brand_reference',
  'paid_creative_reference',
  'public_platform_reference',
] as const satisfies readonly TrendSourceKind[];

const TREND_SOURCE_INTENDED_USE_VALUES = [
  'evergreen_prompt_context',
  'organic_trend_discovery',
  'paid_creative_analysis',
] as const satisfies readonly TrendSourceIntendedUse[];

@AutoSwagger()
@Controller('trends')
@UseInterceptors(CreditsInterceptor)
export class TrendsDiscoveryController {
  private static readonly PROMPT_REFERENCE_INTENTS: TrendSourceIntendedUse[] = [
    'evergreen_prompt_context',
    'organic_trend_discovery',
    'paid_creative_analysis',
  ];
  private static readonly PROMPT_REFERENCE_PACK_TYPES: TrendPromptReferencePackType[] =
    ['hooks', 'formats', 'references', 'constraints'];

  constructor(private readonly trendsService: TrendsService) {}

  @Get('discovery')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getTrendsDiscovery',
    summary: 'getTrendsDiscovery',
  })
  async getTrendsDiscovery(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('refresh') refresh?: string,
  ) {
    const organizationId = user.organizationId;
    const brandId = user.brandId;

    if (refresh === 'true') {
      await this.trendsService.refreshTrends(organizationId, brandId);
    }

    const result = await this.trendsService.getTrendsDiscovery(
      organizationId,
      brandId,
      platform,
    );

    return {
      summary: {
        connectedPlatforms: result.connectedPlatforms,
        lockedPlatforms: result.lockedPlatforms,
        totalTrends: result.trends.length,
      },
      trends: result.trends,
    };
  }

  @Get('content')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getTrendContent',
    summary: 'getTrendContent',
  })
  async getTrendContent(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('limit') limitParam?: string,
    @Query('refresh') refresh?: string,
  ) {
    const organizationId = user.organizationId;
    const brandId = user.brandId;
    const parsedLimit = Number.parseInt(limitParam ?? '30', 10);
    const limit = Number.isNaN(parsedLimit)
      ? 30
      : Math.min(Math.max(parsedLimit, 1), 100);

    const result = await this.trendsService.getTrendContent(
      organizationId,
      brandId,
      {
        limit,
        platform,
        refresh: refresh === 'true',
      },
    );

    return {
      items: result.items,
      summary: {
        connectedPlatforms: result.connectedPlatforms,
        latestTrendAt: result.latestTrendAt,
        lockedPlatforms: result.lockedPlatforms,
        totalItems: result.items.length,
        totalTrends: result.totalTrends ?? result.items.length,
      },
    };
  }

  @Get('references')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getReferenceCorpus',
    summary: 'getReferenceCorpus',
  })
  async getReferenceCorpus(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('trendId') trendId?: string,
    @Query('authorHandle') authorHandle?: string,
    @Query('sourceKind') sourceKindParam?: string,
    @Query('intendedUse') intendedUseParam?: string,
    @Query('includePaidCreative') includePaidCreativeParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    const organizationId = user.organizationId;
    const brandId = user.brandId;
    const parsedLimit = Number.parseInt(limitParam ?? '30', 10);
    const limit = Number.isNaN(parsedLimit)
      ? 30
      : Math.min(Math.max(parsedLimit, 1), 100);

    const result = await this.trendsService.getReferenceCorpus(
      organizationId,
      brandId,
      {
        authorHandle,
        includePaidCreative: this.parseBooleanQuery(includePaidCreativeParam),
        intendedUse: this.parseIntendedUseQuery(intendedUseParam),
        limit,
        platform,
        sourceKind: this.parseSourceKindQuery(sourceKindParam),
        trendId,
      },
    );

    return {
      items: result.items,
      summary: {
        hasMore: result.hasMore,
        totalReferences: result.totalReferences,
      },
    };
  }

  @Get('references/packs')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getPromptReferencePacks',
    summary: 'getPromptReferencePacks',
  })
  async getPromptReferencePacks(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('intent') intentParam?: string,
    @Query('types') typesParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    const organizationId = user.organizationId;
    const brandId = user.brandId;
    const parsedLimit = Number.parseInt(limitParam ?? '12', 10);
    const limit = Number.isNaN(parsedLimit)
      ? 12
      : Math.min(Math.max(parsedLimit, 1), 100);

    return this.trendsService.getPromptReferencePacks(organizationId, brandId, {
      intent: this.parsePromptReferenceIntent(intentParam),
      limit,
      platform,
      types: this.parsePromptReferencePackTypes(typesParam),
    });
  }

  @Get('references/accounts')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getTopReferenceAccounts',
    summary: 'getTopReferenceAccounts',
  })
  async getTopReferenceAccounts(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
    @Query('limit') limitParam?: string,
  ) {
    const organizationId = user.organizationId;
    const brandId = user.brandId;
    const parsedLimit = Number.parseInt(limitParam ?? '20', 10);
    const limit = Number.isNaN(parsedLimit)
      ? 20
      : Math.min(Math.max(parsedLimit, 1), 100);

    const result = await this.trendsService.getTopReferenceAccounts(
      organizationId,
      brandId,
      {
        limit,
        platform,
      },
    );

    return {
      accounts: result.accounts,
      summary: {
        totalAccounts: result.totalAccounts,
      },
    };
  }

  @Get('corpus/health')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'TrendsController.getCorpusFreshnessHealth',
    summary: 'getCorpusFreshnessHealth',
  })
  async getCorpusFreshnessHealth(
    @CurrentUser() user: User,
    @Query('platform') platform?: string,
  ) {
    return this.trendsService.getCorpusFreshnessHealth({
      isPlatformAdmin: user?.isSuperAdmin === true,
      organizationId: user.organizationId,
      platform,
    });
  }

  private parseBooleanQuery(value: string | undefined): boolean | undefined {
    if (value == null || value.length === 0) {
      return undefined;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }

    throw new BadRequestException(
      'includePaidCreative must be "true" or "false"',
    );
  }

  private parseSourceKindQuery(
    value: string | undefined,
  ): TrendSourceKind | undefined {
    if (value == null || value.length === 0) {
      return undefined;
    }
    if (TREND_SOURCE_KIND_VALUES.includes(value as TrendSourceKind)) {
      return value as TrendSourceKind;
    }

    throw new BadRequestException(`Unknown trend source kind: ${value}`);
  }

  private parseIntendedUseQuery(
    value: string | undefined,
  ): TrendSourceIntendedUse | undefined {
    if (value == null || value.length === 0) {
      return undefined;
    }
    if (
      TREND_SOURCE_INTENDED_USE_VALUES.includes(value as TrendSourceIntendedUse)
    ) {
      return value as TrendSourceIntendedUse;
    }

    throw new BadRequestException(
      `Unknown trend source intended use: ${value}`,
    );
  }

  private parsePromptReferenceIntent(
    value?: string,
  ): TrendSourceIntendedUse | undefined {
    if (!value) {
      return undefined;
    }

    return TrendsDiscoveryController.PROMPT_REFERENCE_INTENTS.includes(
      value as TrendSourceIntendedUse,
    )
      ? (value as TrendSourceIntendedUse)
      : undefined;
  }

  private parsePromptReferencePackTypes(
    value?: string,
  ): TrendPromptReferencePackType[] | undefined {
    if (!value) {
      return undefined;
    }

    const requested = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    const supported = requested.filter(
      (part): part is TrendPromptReferencePackType =>
        TrendsDiscoveryController.PROMPT_REFERENCE_PACK_TYPES.includes(
          part as TrendPromptReferencePackType,
        ),
    );

    return supported.length > 0 ? supported : undefined;
  }
}
