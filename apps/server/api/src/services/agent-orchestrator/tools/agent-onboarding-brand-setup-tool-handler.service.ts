import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { BrandWebsiteParserService } from '@api/services/brand-scraper/brand-website-parser.service';
import { SignupPrefillService } from '@api/services/signup-prefill/signup-prefill.service';
import { normalizeOnboardingUrl } from '@api/services/signup-prefill/utils/normalize-onboarding-url.util';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';

const BRAND_SETUP_TOOLS = [
  'scan_brand_url',
  'save_onboarding_answers',
] as const;
type BrandSetupToolName = (typeof BRAND_SETUP_TOOLS)[number];

@Injectable()
export class AgentOnboardingBrandSetupToolHandler {
  constructor(
    private readonly loggerService: LoggerService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: Pick<
      BrandsService,
      'findOne' | 'updateAgentConfig'
    >,
    private readonly brandDataMapper: BrandDataMapper,
    @Optional() private readonly signupPrefillService?: SignupPrefillService,
  ) {}

  execute(
    toolName: BrandSetupToolName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'scan_brand_url':
        return this.scanBrandUrl(params, ctx);
      case 'save_onboarding_answers':
        return this.saveOnboardingAnswers(params, ctx);
    }
  }

  async scanBrandUrl(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const currentBrandId = ctx.validatedScope?.brandId ?? ctx.brandId;
    const brandId = readOptionalString(params.brandId) ?? currentBrandId;
    let creditsUsed = 0;
    let sourceUrl = '';
    try {
      if (typeof params.url !== 'string')
        throw new BadRequestException('URL required');
      sourceUrl = normalizeOnboardingUrl(params.url);
      if (!brandId || (currentBrandId && brandId !== currentBrandId))
        throw new NotFoundException('Brand');
      if (!this.signupPrefillService)
        throw new ServiceUnavailableException('Scan service unavailable');
      const state = await this.signupPrefillService.scanBrandUrl(
        {
          brandId,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
        sourceUrl,
        (credits) => {
          creditsUsed += credits;
        },
      );
      if (state.scrapeStatus !== 'scraped') {
        return {
          success: true,
          creditsUsed,
          data: {
            status: 'failed',
            sourceUrl,
            brandId,
            reason: state.scrapeReason ?? 'scrape_failed',
          },
        };
      }
      const summary = state.summary;
      if (!summary)
        throw new InternalServerErrorException('Scan summary unavailable');
      return {
        success: true,
        creditsUsed,
        data: { status: 'scanned', sourceUrl, brandId, summary },
        nextActions: [
          {
            id: `brand-scan-${Date.now()}`,
            type: 'completion_summary_card',
            title: summary.name,
            summaryText: summary.description ?? summary.name,
            outcomeBullets: [
              summary.primaryColor
                ? `Primary color: ${summary.primaryColor}`
                : '',
              summary.secondaryColor
                ? `Secondary color: ${summary.secondaryColor}`
                : '',
              summary.tone ? `Tone: ${summary.tone}` : '',
            ].filter(Boolean),
            ...(summary.logoUrl
              ? {
                  outputVariants: [
                    {
                      id: 'brand-logo',
                      kind: 'image' as const,
                      title: summary.name,
                      url: summary.logoUrl,
                    },
                  ],
                }
              : {}),
          },
        ],
      };
    } catch (error: unknown) {
      this.loggerService.warn('Onboarding brand scan failed', {
        brandId,
        error: error instanceof Error ? error.message : String(error),
        organizationId: ctx.organizationId,
        sourceUrl: new BrandWebsiteParserService().sanitizeProvenanceUrl(
          sourceUrl,
        ),
      });
      return {
        success: true,
        creditsUsed,
        data: {
          status: 'failed',
          sourceUrl,
          brandId: brandId ?? null,
          reason:
            error instanceof RequestTimeoutException
              ? 'timeout'
              : error instanceof BadRequestException
                ? 'invalid_url'
                : error instanceof ConflictException
                  ? 'scan_in_progress'
                  : error instanceof ForbiddenException
                    ? 'forbidden'
                    : error instanceof NotFoundException
                      ? 'brand_not_found'
                      : 'scan_failed',
        },
      };
    }
  }

  async saveOnboardingAnswers(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const readShortString = (
      value: unknown,
      key: string,
    ): string | undefined => {
      if (value === undefined) return undefined;
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.trim().length > 200
      )
        throw new BadRequestException(
          `${key} must be a non-empty string of at most 200 characters.`,
        );
      return value.trim();
    };
    const readAnswers = (value: unknown, key: string): string[] | undefined => {
      if (value === undefined) return undefined;
      if (!Array.isArray(value) || value.length > 10)
        throw new BadRequestException(
          `${key} must contain at most 10 answers.`,
        );
      return value.map((item) => {
        if (typeof item !== 'string')
          throw new BadRequestException(`${key} must contain short strings.`);
        readShortString(item, key);
        return item.trim();
      });
    };
    const goals = readAnswers(params.goals, 'goals');
    const platforms = readAnswers(params.platforms, 'platforms');
    const frequency = readShortString(params.cadence, 'cadence');
    const tone = readShortString(params.toneAdjustment, 'toneAdjustment');
    const currentBrandId = ctx.validatedScope?.brandId ?? ctx.brandId;
    const brandId =
      readShortString(params.brandId, 'brandId') ?? currentBrandId;
    if (!brandId || (currentBrandId && currentBrandId !== brandId))
      throw new BadRequestException(
        'Choose the current brand before saving onboarding answers.',
      );
    const brand = await this.brandsService.findOne({
      id: brandId,
      organizationId: ctx.organizationId,
      isDeleted: false,
    });
    if (!brand)
      throw new ForbiddenException(
        'The brand is not available in this organization.',
      );
    const config = this.brandDataMapper.readBrandAgentConfig(brand.agentConfig);
    const updated = await this.brandsService.updateAgentConfig(
      brandId,
      ctx.organizationId,
      {
        strategy: {
          ...config.strategy,
          ...(goals !== undefined ? { goals } : {}),
          ...(platforms !== undefined ? { platforms } : {}),
          ...(frequency !== undefined ? { frequency } : {}),
        },
        ...(tone !== undefined ? { voice: { ...config.voice, tone } } : {}),
      },
    );
    if (!updated)
      throw new ForbiddenException(
        'The brand is not available in this organization.',
      );
    return {
      creditsUsed: 0,
      success: true,
      data: { brandId, message: 'Onboarding answers saved.' },
    };
  }
}
