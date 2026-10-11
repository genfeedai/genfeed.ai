import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { readOnboardingAnswersProgress } from '@api/collections/brands/utils/onboarding-answers-progress.util';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AgentBrandContextAskService } from '@api/services/agent-orchestrator/tools/agent-brand-context-ask.service';
import { completeExpertBrandHandoff } from '@api/services/agent-orchestrator/tools/agent-onboarding-brand-handoff.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { BrandWebsiteParserService } from '@api/services/brand-scraper/brand-website-parser.service';
import { SignupPrefillService } from '@api/services/signup-prefill/signup-prefill.service';
import { normalizeOnboardingUrl } from '@api/services/signup-prefill/utils/normalize-onboarding-url.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  AgentToolResult,
  OnboardingAnswerFieldId,
} from '@genfeedai/contracts/interfaces';
import {
  ONBOARDING_ANSWER_FIELD_IDS,
  ONBOARDING_ANSWER_REWARD_CREDITS,
} from '@genfeedai/contracts/types';
import { computeBrandCompleteness } from '@genfeedai/helpers';
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

const TONE_KEEP = 'keep';
const TONE_LEARN_FROM_INSTAGRAM = 'learn_from_instagram';

function isOnboardingAnswerFieldId(
  value: unknown,
): value is OnboardingAnswerFieldId {
  return ONBOARDING_ANSWER_FIELD_IDS.some((fieldId) => fieldId === value);
}

function readSkippedFields(value: unknown): OnboardingAnswerFieldId[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > ONBOARDING_ANSWER_FIELD_IDS.length ||
    !value.every(isOnboardingAnswerFieldId)
  )
    throw new BadRequestException(
      `skippedFields must only contain ${ONBOARDING_ANSWER_FIELD_IDS.join(', ')}.`,
    );
  return [...new Set(value)];
}

const BRAND_SETUP_TOOLS = [
  'complete_brand_onboarding_step',
  'scan_brand_url',
  'save_onboarding_answers',
] as const;
type BrandSetupToolName = (typeof BRAND_SETUP_TOOLS)[number];

/** A trimmed onboarding answer of at most 200 characters, or undefined when absent. */
function readShortString(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200)
    throw new BadRequestException(
      `${key} must be a non-empty string of at most 200 characters.`,
    );
  return value.trim();
}

/** Up to `max` short onboarding answers, or undefined when absent. */
function readAnswers(
  value: unknown,
  key: string,
  max = 10,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > max)
    throw new BadRequestException(
      `${key} must contain at most ${max} answers.`,
    );
  return value.map((item) => {
    if (typeof item !== 'string')
      throw new BadRequestException(`${key} must contain short strings.`);
    readShortString(item, key);
    return item.trim();
  });
}

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
    private readonly brandContextAsks: AgentBrandContextAskService,
    @Optional() private readonly signupPrefillService?: SignupPrefillService,
    @Optional() private readonly organizationsService?: OrganizationsService,
    @Optional() private readonly usersService?: UsersService,
    @Optional()
    private readonly userAccessCacheService?: UserAccessCacheService,
    @Optional()
    private readonly credentialsService?: CredentialsService,
    @Optional()
    private readonly onboardingCreditGrantsService?: OnboardingCreditGrantsService,
  ) {}

  execute(
    toolName: BrandSetupToolName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'complete_brand_onboarding_step':
        return this.completeBrandOnboardingStep(ctx);
      case 'scan_brand_url':
        return this.scanBrandUrl(params, ctx);
      case 'save_onboarding_answers':
        return this.saveOnboardingAnswers(params, ctx);
    }
  }

  async completeBrandOnboardingStep(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    await completeExpertBrandHandoff(
      ctx,
      this.brandsService,
      this.organizationsService,
      this.usersService,
      this.userAccessCacheService,
    );
    return {
      success: true,
      creditsUsed: 0,
      data: { completedStep: 'brand', href: '/onboarding/positioning' },
      nextActions: [
        {
          id: `expert-handoff-${ctx.threadId}`,
          type: 'completion_summary_card',
          title: 'Your brand is ready',
          summaryText:
            'Continue with your positioning interview and source corpus.',
          primaryCta: { label: 'Continue', href: '/onboarding/positioning' },
        },
      ],
    };
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
    const goals = readAnswers(params.goals, 'goals');
    const audience = readAnswers(params.audience, 'audience', 2);
    const offer = readShortString(params.offer, 'offer');
    const competitors = readAnswers(params.competitors, 'competitors', 3);
    const platforms = readAnswers(params.platforms, 'platforms');
    const frequency = readShortString(params.cadence, 'cadence');
    const tone = readShortString(params.toneAdjustment, 'toneAdjustment');
    const skippedFields = readSkippedFields(params.skippedFields);
    const answeredFields = ONBOARDING_ANSWER_FIELD_IDS.filter((fieldId) => {
      const answer = {
        audience,
        cadence: frequency,
        competitors,
        goals,
        offer,
        platforms,
        tone,
      }[fieldId];
      return Array.isArray(answer) ? answer.length > 0 : answer !== undefined;
    });
    const conflicting = skippedFields.find((fieldId) =>
      answeredFields.includes(fieldId),
    );
    if (conflicting)
      throw new BadRequestException(
        `${conflicting} cannot be answered and skipped in the same save.`,
      );
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
    const saveMode = await this.brandContextAsks.resolveSaveMode(ctx);
    if (saveMode === 'in_flow')
      this.brandContextAsks.assertInFlowSaveAllowed(
        brand.agentConfig,
        ctx.threadId,
        [...answeredFields, ...skippedFields],
      );
    const isLearningFromInstagram = tone === TONE_LEARN_FROM_INSTAGRAM;
    if (isLearningFromInstagram) {
      const accounts = await this.credentialsService?.findConnectedAccounts(
        ctx.organizationId,
        brandId,
        CredentialPlatform.INSTAGRAM,
      );
      if (!accounts?.length)
        throw new BadRequestException(
          'Connect Instagram for this brand before learning its voice.',
        );
    }
    const config = this.brandDataMapper.readBrandAgentConfig(brand.agentConfig);
    const progress = readOnboardingAnswersProgress(config);
    const updatedAt = new Date().toISOString();
    for (const fieldId of answeredFields)
      progress.fields[fieldId] = { status: 'answered', updatedAt };
    for (const fieldId of skippedFields)
      progress.fields[fieldId] = { status: 'skipped', updatedAt };
    const isToneWritten =
      tone !== undefined && tone !== TONE_KEEP && !isLearningFromInstagram;
    const updated = await this.brandsService.updateAgentConfig(
      brandId,
      ctx.organizationId,
      {
        strategy: {
          ...config.strategy,
          ...(goals !== undefined ? { goals } : {}),
          ...(platforms !== undefined ? { platforms } : {}),
          ...(frequency !== undefined ? { frequency } : {}),
          ...(offer !== undefined ? { offers: [offer] } : {}),
          ...(competitors !== undefined ? { competitors } : {}),
        },
        ...(isToneWritten || audience !== undefined
          ? {
              voice: {
                ...config.voice,
                ...(isToneWritten ? { tone } : {}),
                ...(audience !== undefined ? { audience } : {}),
              },
            }
          : {}),
        onboardingAnswers: {
          fields: progress.fields,
          ...(isLearningFromInstagram || progress.voiceSource
            ? { voiceSource: 'instagram' }
            : {}),
        },
      },
    );
    if (!updated)
      throw new ForbiddenException(
        'The brand is not available in this organization.',
      );
    // Answer credits are an onboarding reward only, so an in-flow answer
    // after onboarding never grants them.
    const rewardedFields =
      saveMode === 'onboarding'
        ? await this.grantAnswerCredits(ctx, brandId, answeredFields)
        : [];
    return {
      creditsUsed: 0,
      success: true,
      data: {
        brandId,
        answeredFields,
        skippedFields,
        rewardedFields,
        creditsEarned: rewardedFields.length * ONBOARDING_ANSWER_REWARD_CREDITS,
        completenessScore: computeBrandCompleteness(
          updated as Parameters<typeof computeBrandCompleteness>[0],
        ).overallScore,
        message: 'Onboarding answers saved.',
      },
    };
  }

  /**
   * The answers are already saved; a failed grant is logged rather than
   * failing the save. The ledger key makes a later retry safe.
   */
  private async grantAnswerCredits(
    ctx: ToolExecutionContext,
    brandId: string,
    answeredFields: OnboardingAnswerFieldId[],
  ): Promise<OnboardingAnswerFieldId[]> {
    if (!this.onboardingCreditGrantsService || answeredFields.length === 0)
      return [];
    try {
      return await this.onboardingCreditGrantsService.grantOnboardingAnswerCredits(
        ctx.organizationId,
        brandId,
        answeredFields,
        ctx.userId,
      );
    } catch (error: unknown) {
      this.loggerService.warn('Onboarding answer credit grant failed', {
        brandId,
        error: error instanceof Error ? error.message : String(error),
        organizationId: ctx.organizationId,
      });
      return [];
    }
  }
}
