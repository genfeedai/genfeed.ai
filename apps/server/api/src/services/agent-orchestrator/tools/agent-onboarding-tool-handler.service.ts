import { randomUUID } from 'node:crypto';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import {
  AGENT_GENERATION_GATEWAY,
  type IAgentGenerationGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import {
  readMediaResponseString,
  readUsableCdnAssetUrl,
  toMediaResponseRecord,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import { createOnboardingBrandDraft } from '@api/services/agent-orchestrator/tools/agent-onboarding-content.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  hasOrganizationBilling,
  isSelfHostedDeployment,
} from '@genfeedai/config';
import {
  ByokProvider,
  RouterPriority,
  Status,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import type {
  AgentToolResult,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_JOURNEY_TOTAL_CREDITS,
  type OnboardingJourneyMissionId,
  resolveMissionCtaHref,
} from '@genfeedai/contracts/types';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

/**
 * BYOK providers `generate_image` can actually reach, mirroring the branches in
 * `ImageGenerationHandler`. Onboarding-scoped on purpose: a text-only key such
 * as OpenAI or Anthropic satisfies "a provider is configured" but cannot produce
 * the first onboarding image, so the prompt and checklist gate on this set
 * instead of on provider count. Provider capability semantics elsewhere are
 * unchanged.
 */
const IMAGE_CAPABLE_ONBOARDING_PROVIDERS: readonly string[] = [
  ByokProvider.FAL,
  ByokProvider.LEONARDOAI,
  ByokProvider.REPLICATE,
];

/**
 * Brand identity awaiting confirmation. `voice` and `niche` travel with the
 * confirmation card payload so the confirmed create can store them as
 * structured agent config instead of folding them into free text.
 */
type BrandIdentityProposal = {
  description: string;
  label: string;
  niche?: string;
  slug: string;
  voice?: string;
};

const MAX_BRAND_VOICE_OR_NICHE_LENGTH = 500;

interface AgentBrandsServiceLike {
  create: (
    createDto: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
  findCreateByIdentityConfirmationSource: (
    organizationId: string,
    userId: string,
    sourceActionId: string,
  ) => Promise<Record<string, unknown> | null>;
  updateIdentityForOrganization: (
    id: string,
    organizationId: string,
    identity: { description: string; label: string; slug: string },
  ) => Promise<Record<string, unknown>>;
}

/**
 * Onboarding / activation tools extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentOnboardingToolHandler {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    private readonly postsService: PostsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly contentGeneratorService: ContentGeneratorService,
    @Inject(AGENT_GENERATION_GATEWAY)
    private readonly generationGateway: IAgentGenerationGateway,
    private readonly onboardingCreditGrantsService: OnboardingCreditGrantsService,
    @Optional()
    private readonly credentialsService?: CredentialsService,
    @Optional()
    private readonly imagesService?: ImagesService,
    @Optional()
    private readonly organizationsService?: OrganizationsService,
    @Optional()
    private readonly organizationSettingsService?: OrganizationSettingsService,
    @Optional()
    private readonly usersService?: UsersService,
    @Optional()
    private readonly videosService?: VideosService,
    @Optional()
    private readonly streamPublisher?: AgentStreamPublisherService,
  ) {}

  private async publishToolProgress(data: {
    message: string;
    progress: number;
    threadId: string;
    toolName: string;
    userId: string;
  }): Promise<void> {
    if (!this.streamPublisher) {
      return;
    }
    await this.streamPublisher.publishToolProgress(data);
  }

  async createBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const fallbackName = 'My Brand';
    const label = this.readBrandLabel(
      params.label ?? params.name ?? params.brandName,
      fallbackName,
    );
    const slug = this.normalizeBrandSlug(params.slug ?? params.handle, label);
    const niche = this.readOptionalBrandTrait(params.niche, 'niche');
    const voice = this.readOptionalBrandTrait(params.voice, 'voice');
    const description =
      ctx.confirmationOrigin === 'thread-ui-action'
        ? this.readOptionalBrandDescription(
            params.description,
            `Brand profile for ${label}`,
          )
        : this.buildProposedDescription(params.description, label, niche);
    const proposal: BrandIdentityProposal = {
      description,
      label,
      ...(niche ? { niche } : {}),
      slug,
      ...(voice ? { voice } : {}),
    };

    if (ctx.confirmationOrigin !== 'thread-ui-action') {
      return this.buildBrandIdentityProposal('create', proposal, ctx);
    }
    const sourceActionId = this.readConfirmedBrandIdentitySourceActionId(
      params.sourceActionId,
    );

    if (ctx.validatedScope?.brandId) {
      const boundBrand = await this.brandsService.findOne({
        id: ctx.validatedScope.brandId,
        organizationId: ctx.organizationId,
      });
      if (
        this.isMatchingCreateRecovery(boundBrand, proposal, sourceActionId, ctx)
      ) {
        return this.buildRecoveredCreateResult(boundBrand, proposal);
      }
      return {
        creditsUsed: 0,
        error:
          'The thread is already bound to a different brand identity confirmation.',
        success: false,
      };
    }

    const recoveredBySource =
      await this.brandsService.findCreateByIdentityConfirmationSource(
        ctx.organizationId,
        ctx.userId,
        sourceActionId,
      );
    if (recoveredBySource) {
      if (
        this.isMatchingCreateRecovery(
          recoveredBySource,
          proposal,
          sourceActionId,
          ctx,
        )
      ) {
        return this.buildRecoveredCreateResult(recoveredBySource, proposal);
      }
      return {
        creditsUsed: 0,
        error:
          'This brand identity confirmation is already associated with a different brand identity.',
        success: false,
      };
    }

    const existing = await this.brandsService.findOne({
      organizationId: ctx.organizationId,
      slug,
    });

    if (existing) {
      if (
        this.isMatchingCreateRecovery(existing, proposal, sourceActionId, ctx)
      ) {
        return this.buildRecoveredCreateResult(existing, proposal);
      }

      return {
        creditsUsed: 0,
        error: 'A brand with this slug already exists in the organization.',
        success: false,
      };
    }

    const brand = await this.brandsService.create({
      agentConfig: {
        brandIdentityConfirmation: {
          createSourceActionId: sourceActionId,
          requestedSlug: slug,
          source: 'agent-thread-ui-action',
        },
        // Structured fields the agent brand context renders as Brand Voice
        // and Content Strategy; `Brand.text` stays reserved for guidelines.
        ...(niche ? { strategy: { topics: [niche] } } : {}),
        ...(voice ? { voice: { tone: voice } } : {}),
      },
      backgroundColor: '#000000',
      description,
      fontFamily: 'montserrat_black',
      isSelected: false,
      label,
      organizationId: ctx.organizationId,
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      slug,
      userId: ctx.userId,
    });
    const createdSlug =
      typeof brand.slug === 'string' && brand.slug.trim()
        ? brand.slug.trim()
        : slug;

    const onboardingStatus = await this.checkOnboardingStatus(ctx);

    return {
      creditsUsed: 0,
      data: {
        created: true,
        brandId: String(brand.id),
        id: String(brand.id),
        label,
        slug: createdSlug,
      },
      nextActions: onboardingStatus.nextActions,
      success: true,
    };
  }

  private isMatchingCreateRecovery(
    brand: Record<string, unknown> | null,
    proposal: BrandIdentityProposal,
    sourceActionId: string,
    ctx: ToolExecutionContext,
  ): brand is Record<string, unknown> {
    if (!brand) {
      return false;
    }
    const agentConfig = this.readRecord(brand.agentConfig);
    const provenance = this.readRecord(agentConfig.brandIdentityConfirmation);
    return (
      provenance.createSourceActionId === sourceActionId &&
      provenance.requestedSlug === proposal.slug &&
      brand.organizationId === ctx.organizationId &&
      brand.userId === ctx.userId &&
      brand.label === proposal.label &&
      brand.description === proposal.description
    );
  }

  private buildRecoveredCreateResult(
    brand: Record<string, unknown>,
    proposal: BrandIdentityProposal,
  ): AgentToolResult {
    return {
      creditsUsed: 0,
      data: {
        brandId: String(brand.id),
        created: false,
        id: String(brand.id),
        label: proposal.label,
        recovered: true,
        slug: this.readString(brand.slug) || proposal.slug,
      },
      success: true,
    };
  }

  async renameBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = ctx.validatedScope?.brandId;
    if (!brandId) {
      throw new BadRequestException(
        'An active thread brand is required to rename a brand.',
      );
    }
    const sourceActionId =
      ctx.confirmationOrigin === 'thread-ui-action'
        ? this.readConfirmedBrandIdentitySourceActionId(params.sourceActionId)
        : undefined;

    const currentBrand = await this.brandsService.findOne({
      id: brandId,
      organizationId: ctx.organizationId,
    });
    if (!currentBrand) {
      throw new ForbiddenException(
        'The active thread brand is not available in this organization.',
      );
    }

    const currentLabel = this.readBrandLabel(currentBrand.label, 'Brand');
    const currentSlug = this.normalizeBrandSlug(
      currentBrand.slug,
      currentLabel,
    );
    const label = this.readBrandLabel(params.label, currentLabel);
    const slug = this.normalizeBrandSlug(params.slug, label);
    const description = this.readOptionalBrandDescription(
      params.description,
      currentBrand.description,
    );
    const proposal = { description, label, slug };

    if (ctx.confirmationOrigin !== 'thread-ui-action') {
      return this.buildBrandIdentityProposal('rename', proposal, ctx, {
        label: currentLabel,
        slug: currentSlug,
      });
    }
    if (!sourceActionId) {
      throw new BadRequestException(
        'Confirmed brand identity changes require source action evidence.',
      );
    }

    const updated = await this.brandsService.updateIdentityForOrganization(
      brandId,
      ctx.organizationId,
      proposal,
    );

    return {
      creditsUsed: 0,
      data: {
        brandId,
        description,
        id: String(updated.id ?? brandId),
        label,
        renamed: true,
        slug,
      },
      success: true,
    };
  }

  private buildBrandIdentityProposal(
    operation: 'create' | 'rename',
    proposal: BrandIdentityProposal,
    ctx: ToolExecutionContext,
    currentIdentity?: { label: string; slug: string },
  ): AgentToolResult {
    const sourceActionId = `brand-identity-${randomUUID()}`;
    const action =
      operation === 'create' ? 'confirm_create_brand' : 'confirm_rename_brand';
    const label = operation === 'create' ? 'Confirm create' : 'Confirm rename';

    return {
      creditsUsed: 0,
      data: {
        operation,
        proposal,
        sourceActionId,
      },
      nextActions: [
        {
          ctas: [
            {
              action,
              label,
              payload: {
                ...proposal,
                sourceActionId,
              },
            },
          ],
          data: {
            ...(currentIdentity ? { currentIdentity } : {}),
            operation,
            proposal,
            proposalScope: {
              brandId: ctx.validatedScope?.brandId ?? null,
              contextVersion: ctx.validatedScope?.contextVersion ?? null,
            },
            sourceActionId,
          },
          description:
            operation === 'create'
              ? 'Review the proposed identity before creating the brand.'
              : 'Review the proposed identity before renaming the active brand.',
          id: sourceActionId,
          requiresConfirmation: true,
          riskLevel: 'medium',
          title:
            operation === 'create'
              ? 'Confirm brand creation'
              : 'Confirm brand rename',
          type: 'brand_identity_confirmation_card',
        },
      ],
      requiresConfirmation: true,
      riskLevel: 'medium',
      success: true,
    };
  }

  private buildProposedDescription(
    value: unknown,
    label: string,
    niche: string | undefined,
  ): string {
    const description = this.readOptionalBrandDescription(value, undefined);
    if (description) {
      return description;
    }

    return niche
      ? `Brand profile for ${label}, focused on ${this.trimSentenceEnd(niche)}.`
      : `Brand profile for ${label}`;
  }

  /** Optional short brand trait (voice, niche) supplied by the agent. */
  private readOptionalBrandTrait(
    value: unknown,
    field: 'niche' | 'voice',
  ): string | undefined {
    const trait = this.readString(value);
    if (!trait) {
      return undefined;
    }
    if (trait.length > MAX_BRAND_VOICE_OR_NICHE_LENGTH) {
      throw new BadRequestException(
        `Brand ${field} must not exceed ${MAX_BRAND_VOICE_OR_NICHE_LENGTH} characters.`,
      );
    }
    return trait;
  }

  /**
   * Strip trailing sentence punctuation and whitespace.
   *
   * A reverse character scan rather than `/[.\s]+$/`: that anchored quantifier
   * backtracks quadratically on a tool parameter ending in a long run of dots
   * or spaces, and these values come straight from agent-supplied params.
   */
  private trimSentenceEnd(value: string): string {
    let end = value.length;
    while (end > 0) {
      const character = value[end - 1];
      if (character !== '.' && character.trim() !== '') {
        break;
      }
      end -= 1;
    }
    return value.slice(0, end);
  }

  private readBrandLabel(value: unknown, fallback: string): string {
    const label = typeof value === 'string' ? value.trim() : '';
    const resolved = label || fallback.trim();
    if (!resolved || resolved.length > 120) {
      throw new BadRequestException(
        'Brand label must contain between 1 and 120 characters.',
      );
    }
    return resolved;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private readConfirmedBrandIdentitySourceActionId(value: unknown): string {
    const sourceActionId = this.readString(value);
    if (
      !/^brand-identity-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        sourceActionId,
      )
    ) {
      throw new BadRequestException(
        'Confirmed brand identity changes require valid source action evidence.',
      );
    }
    return sourceActionId;
  }

  private readOptionalBrandDescription(
    value: unknown,
    fallback: unknown,
  ): string {
    const description =
      typeof value === 'string'
        ? value.trim()
        : typeof fallback === 'string'
          ? fallback.trim()
          : '';
    if (description.length > 2_000) {
      throw new BadRequestException(
        'Brand description must not exceed 2000 characters.',
      );
    }
    return description;
  }

  private normalizeBrandSlug(value: unknown, label: string): string {
    const raw =
      typeof value === 'string' && value.trim() ? value.trim() : label;
    const slug = raw
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
    if (slug.length < 2 || slug.length > 120) {
      throw new BadRequestException(
        'Brand slug must contain between 2 and 120 URL-safe characters.',
      );
    }
    return slug;
  }

  async checkOnboardingStatus(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const organizationId = ctx.organizationId;

    const [brand, credential, firstImage, firstVideo, publishedPost, settings] =
      await Promise.all([
        this.brandsService.findOne({
          organizationId,
        }),
        this.credentialsService
          ? this.credentialsService.findOne({
              isConnected: true,
              organizationId,
            })
          : null,
        this.imagesService
          ? this.imagesService.findOne({
              organizationId,
            })
          : null,
        this.videosService
          ? this.videosService.findOne({
              organizationId,
            })
          : null,
        this.postsService.findOne(
          {
            organizationId,
            targetExecutionState: TargetExecutionState.PUBLISHED,
          },
          [],
        ),
        this.organizationSettingsService
          ? this.organizationSettingsService.findOne({
              organizationId,
            })
          : null,
      ]);

    const normalizedMissions = this.organizationSettingsService
      ? this.organizationSettingsService.normalizeJourneyState(
          settings?.onboardingJourneyMissions as
            | IOnboardingJourneyMissionState[]
            | undefined,
        )
      : [];
    const providerReadiness = this.resolveProviderReadiness(settings);
    const isSelfHosted = isSelfHostedDeployment();

    const completionMap: Record<OnboardingJourneyMissionId, boolean> = {
      complete_company_info: !!brand,
      connect_social_account: !!credential,
      generate_first_image: !!firstImage,
      generate_first_video: !!firstVideo,
      publish_first_post: !!publishedPost,
    };

    const {
      earnedCredits,
      journeyCompleted,
      missions,
      nextRecommendedMission,
    } = await this.syncOnboardingJourneyState(
      ctx,
      normalizedMissions,
      completionMap,
    );
    const completionPercent =
      missions.length > 0
        ? Math.round(
            (missions.filter((mission) => mission.isCompleted).length /
              missions.length) *
              100,
          )
        : 0;
    const creditBuckets = await this.getOnboardingCreditBuckets(
      ctx.organizationId,
      earnedCredits,
    );

    const data = isSelfHosted
      ? {
          completionPercent,
          isComplete: journeyCompleted,
          journeyCompleted,
          missions,
          nextRecommendedMission,
          providerReadiness,
        }
      : {
          completionPercent,
          earnedCredits,
          isComplete: journeyCompleted,
          journeyCompleted,
          journeyEarnedCredits: creditBuckets.journeyEarnedCredits,
          journeyRemainingCredits: creditBuckets.journeyRemainingCredits,
          missions,
          nextRecommendedMission,
          signupGiftCredits: creditBuckets.signupGiftCredits,
          totalOnboardingCreditsVisible:
            creditBuckets.totalOnboardingCreditsVisible,
        };

    return {
      creditsUsed: 0,
      data,
      nextActions: [
        this.buildOnboardingChecklistCard(
          missions,
          creditBuckets,
          providerReadiness.isImageReady,
        ),
      ],
      success: true,
    };
  }
  private buildOnboardingChecklistCard(
    missions: IOnboardingJourneyMissionState[],
    creditBuckets: {
      journeyEarnedCredits: number;
      journeyRemainingCredits: number;
      signupGiftCredits: number;
      totalOnboardingCreditsVisible: number;
    },
    hasImageCapableProvider: boolean,
  ): AgentUiAction {
    const isSelfHosted = isSelfHostedDeployment();
    const nextRecommendedMissionId =
      missions.find((mission) => !mission.isCompleted)?.id ?? null;
    const completionPercent =
      missions.length > 0
        ? Math.round(
            (missions.filter((mission) => mission.isCompleted).length /
              missions.length) *
              100,
          )
        : 0;

    const checklist = ONBOARDING_JOURNEY_MISSIONS.map((mission) => {
      const state = missions.find((item) => item.id === mission.id);

      if (isSelfHosted) {
        const description =
          mission.id === 'generate_first_image' && !hasImageCapableProvider
            ? 'Add an image provider API key (fal, Replicate, or Leonardo) before generating your first image.'
            : mission.id === 'publish_first_post'
              ? 'Publish your first post to complete the onboarding journey.'
              : mission.description;

        return {
          ctaHref: resolveMissionCtaHref(mission, { isSelfHosted: true }),
          ctaLabel: mission.ctaLabel,
          description,
          id: mission.id,
          isClaimed: false,
          isCompleted: state?.isCompleted ?? false,
          isRecommended: mission.id === nextRecommendedMissionId,
          label: mission.label,
          rewardCredits: 0,
        };
      }

      return {
        ctaHref: mission.ctaHref,
        ctaLabel: mission.ctaLabel,
        description: mission.description,
        id: mission.id,
        isClaimed: state?.rewardClaimed ?? false,
        isCompleted: state?.isCompleted ?? false,
        isRecommended: mission.id === nextRecommendedMissionId,
        label: mission.label,
        rewardCredits: mission.rewardCredits,
      };
    });

    if (isSelfHosted) {
      return {
        checklist,
        completionPercent,
        description:
          'Complete these setup steps to prepare your brand, providers, and publishing workflow.',
        id: `onboarding-journey-${Date.now()}`,
        title: 'Activation Journey',
        type: 'onboarding_checklist_card',
      };
    }

    return {
      checklist,
      completionPercent,
      description:
        creditBuckets.signupGiftCredits > 0
          ? `Your signup gift is live. Unlock ${creditBuckets.journeyRemainingCredits} more Gen credits as you finish setup.`
          : 'Unlock more Gen credits by completing the setup missions that make your content better.',
      earnedCredits: creditBuckets.journeyEarnedCredits,
      id: `onboarding-journey-${Date.now()}`,
      journeyEarnedCredits: creditBuckets.journeyEarnedCredits,
      journeyRemainingCredits: creditBuckets.journeyRemainingCredits,
      signupGiftCredits: creditBuckets.signupGiftCredits,
      title: 'Activation Journey',
      totalJourneyCredits: ONBOARDING_JOURNEY_TOTAL_CREDITS,
      totalOnboardingCreditsVisible:
        creditBuckets.totalOnboardingCreditsVisible,
      type: 'onboarding_checklist_card',
    };
  }

  private async getOnboardingCreditBuckets(
    organizationId: string,
    earnedCredits: number,
  ): Promise<{
    signupGiftCredits: number;
    journeyEarnedCredits: number;
    journeyRemainingCredits: number;
    totalOnboardingCreditsVisible: number;
  }> {
    if (isSelfHostedDeployment()) {
      return {
        journeyEarnedCredits: 0,
        journeyRemainingCredits: 0,
        signupGiftCredits: 0,
        totalOnboardingCreditsVisible: 0,
      };
    }

    const credits =
      await this.creditsUtilsService.getOrganizationCreditsWithExpiration(
        organizationId,
      );
    const signupGiftCredits = credits.credits.reduce((total, entry) => {
      if (entry.source !== 'onboarding-signup-gift') {
        return total;
      }

      return total + entry.balance;
    }, 0);

    return {
      journeyEarnedCredits: earnedCredits,
      journeyRemainingCredits: Math.max(
        ONBOARDING_JOURNEY_TOTAL_CREDITS - earnedCredits,
        0,
      ),
      signupGiftCredits,
      totalOnboardingCreditsVisible:
        signupGiftCredits + ONBOARDING_JOURNEY_TOTAL_CREDITS,
    };
  }

  async completeJourneyMission(
    ctx: ToolExecutionContext,
    missionId: OnboardingJourneyMissionId,
  ): Promise<void> {
    await this.onboardingCreditGrantsService.completeMissions(
      ctx.organizationId,
      [missionId],
      ctx.userId,
    );
  }

  private async syncOnboardingJourneyState(
    ctx: ToolExecutionContext,
    missions: IOnboardingJourneyMissionState[],
    completionMap: Record<OnboardingJourneyMissionId, boolean>,
  ): Promise<{
    missions: IOnboardingJourneyMissionState[];
    earnedCredits: number;
    journeyCompleted: boolean;
    nextRecommendedMission: OnboardingJourneyMissionId | null;
  }> {
    if (!this.organizationSettingsService) {
      return {
        earnedCredits: 0,
        journeyCompleted: false,
        missions,
        nextRecommendedMission: null,
      };
    }

    const claimedMissions =
      await this.onboardingCreditGrantsService.completeMissions(
        ctx.organizationId,
        ONBOARDING_JOURNEY_MISSIONS.filter(
          (mission) => completionMap[mission.id],
        ).map((mission) => mission.id),
        ctx.userId,
      );
    const earnedCredits = claimedMissions
      .filter((mission) => mission.rewardClaimed)
      .reduce((total, mission) => total + mission.rewardCredits, 0);
    const journeyCompleted =
      claimedMissions.length > 0 &&
      claimedMissions.every((mission) => mission.isCompleted);

    if (journeyCompleted) {
      if (this.organizationsService) {
        await this.organizationsService.patch(ctx.organizationId, {
          onboardingCompleted: true,
        });
      }

      if (this.usersService) {
        const dbUser = await this.usersService.findOne({
          id: ctx.userId,
        });

        if (dbUser?.id) {
          await this.usersService.patch(dbUser.id, {
            isOnboardingCompleted: true,
            onboardingCompletedAt: new Date(),
            onboardingStepsCompleted: ['brand', 'plan'],
          });
        }
      }

      // isOnboardingCompleted is persisted on the User row above (epic #735,
      // Phase C — no legacy auth provider identity write-back).
    }

    return {
      earnedCredits,
      journeyCompleted,
      missions: claimedMissions,
      nextRecommendedMission:
        this.organizationSettingsService.getNextRecommendedJourneyMission(
          claimedMissions,
        ),
    };
  }

  private resolveProviderReadiness(
    settings?: {
      byokKeys?: unknown;
      isByokEnabled?: boolean;
    } | null,
  ): {
    configuredImageProviders: string[];
    configuredProviderCount: number;
    configuredProviders: string[];
    isImageReady: boolean;
    isReady: boolean;
  } {
    const byokKeys =
      settings?.byokKeys &&
      typeof settings.byokKeys === 'object' &&
      !Array.isArray(settings.byokKeys)
        ? (settings.byokKeys as Record<string, unknown>)
        : {};
    // Mirrors OnboardingReadinessService.getConfiguredByokProviders: a key
    // counts when its own entry is enabled and carries a non-empty secret.
    // `isByokEnabled` is not a precondition — that flag is derived from the
    // configured keys, not the other way around.
    const configuredProviders = Object.entries(byokKeys)
      .flatMap(([providerKey, value]) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return [];
        }

        const entry = value as Record<string, unknown>;

        if (
          entry.isEnabled !== true ||
          typeof entry.apiKey !== 'string' ||
          !entry.apiKey.trim()
        ) {
          return [];
        }

        return [
          typeof entry.provider === 'string' && entry.provider.trim()
            ? entry.provider
            : providerKey,
        ];
      })
      .sort();

    // A configured provider is not automatically an image provider: OpenAI or
    // Anthropic keys make `isReady` true while `generate_image` still has
    // nothing to call.
    const configuredImageProviders = configuredProviders.filter((provider) =>
      IMAGE_CAPABLE_ONBOARDING_PROVIDERS.includes(provider),
    );

    return {
      configuredImageProviders,
      configuredProviderCount: configuredProviders.length,
      configuredProviders,
      isImageReady: configuredImageProviders.length > 0,
      isReady: configuredProviders.length > 0,
    };
  }

  async completeOnboarding(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (this.organizationsService) {
      await this.organizationsService.patch(ctx.organizationId, {
        onboardingCompleted: true,
      });
    }

    let dbUserId: string | null = null;
    if (this.usersService) {
      const dbUser = await this.usersService.findOne({
        id: ctx.userId,
      });

      if (dbUser) {
        dbUserId = String(dbUser.id);
        await this.usersService.patch(dbUser.id, {
          isOnboardingCompleted: true,
          onboardingCompletedAt: new Date(),
          onboardingStepsCompleted: ['brand', 'plan'],
        });
      }
    }

    // isOnboardingCompleted is persisted on the User row above (epic #735,
    // Phase C — no legacy auth provider identity write-back).

    return {
      creditsUsed: 0,
      data: {
        onboardingCompleted: true,
        organizationId: ctx.organizationId,
        userId: dbUserId ?? ctx.userId,
      },
      success: true,
    };
  }

  /**
   * Returns a UI action card prompting the user to connect a social account via OAuth.
   * The frontend renders this as a clickable card that opens the OAuth popup.
   */
  connectSocialAccount(
    params: Record<string, unknown>,
    _ctx: ToolExecutionContext,
  ): AgentToolResult {
    const platform = params.platform as string;

    return {
      creditsUsed: 0,
      data: {
        message: `Please connect your ${platform} account using the button below.`,
        uiAction: {
          platform,
          type: 'oauth_connect_card',
        },
      },
      success: true,
    };
  }

  async generateOnboardingContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const direction =
      readOptionalString(params.direction)?.slice(0, 2000) ?? '';
    const retryTweet = readOptionalString(params.retryTweet);
    if (
      params.retryTweet != null &&
      (typeof params.retryTweet !== 'string' || (retryTweet?.length ?? 0) > 280)
    ) {
      return {
        creditsUsed: 0,
        error:
          'Provide the original tweet (up to 280 characters) to retry its image.',
        success: false,
      };
    }
    const brandId = readOptionalString(params.brandId) ?? ctx.brandId;
    if (!brandId || (ctx.brandId && ctx.brandId !== brandId)) {
      return {
        creditsUsed: 0,
        error: 'Choose the current brand before creating its first post.',
        success: false,
      };
    }

    return createOnboardingBrandDraft({
      brandId,
      brandsService: this.brandsService,
      checkOnboardingStatus: (next) => this.checkOnboardingStatus(next),
      contentGeneratorService: this.contentGeneratorService,
      ctx,
      direction,
      generateImage: (prompt, next) =>
        this.generateOnboardingImage(prompt, next),
      loggerService: this.loggerService,
      organizationSettingsService: this.organizationSettingsService,
      publishProgress: (data) => this.publishToolProgress(data),
      resolveProviderReadiness: (settings) =>
        this.resolveProviderReadiness(settings),
      retryTweet,
    });
  }

  /**
   * Returns a UI action card with payment/credit pack options.
   * Includes a free tier skip path for users not ready to pay.
   */
  presentPaymentOptions(_ctx: ToolExecutionContext): AgentToolResult {
    const billingHref = hasOrganizationBilling()
      ? '/settings/subscription'
      : '/settings/api-keys';
    const billingLabel = hasOrganizationBilling()
      ? 'View all plans'
      : 'Configure providers';

    return {
      creditsUsed: 0,
      data: {
        canSkip: true,
        message: hasOrganizationBilling()
          ? 'Choose a credit pack to unlock video generation, monthly content calendars, and more.'
          : 'Configure provider API keys to unlock generation, workflows, and publishing in your local install.',
      },
      nextActions: [
        {
          ctas: [
            {
              href: billingHref,
              label: billingLabel,
            },
          ],
          id: `payment-cta-${Date.now()}`,
          packs: [
            {
              credits: 100,
              label: 'Starter',
              price: '$9',
            },
            {
              credits: 500,
              label: 'Creator',
              price: '$29',
            },
            {
              credits: 2000,
              label: 'Pro',
              price: '$79',
            },
          ],
          title: 'Unlock credits to publish & generate more',
          type: 'payment_cta_card',
        },
      ],
      success: true,
    };
  }
  private async generateOnboardingImage(
    prompt: string,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const settings = this.organizationSettingsService
      ? await this.organizationSettingsService.findOne({
          organizationId: ctx.organizationId,
        })
      : null;
    if (
      isSelfHostedDeployment() &&
      !this.resolveProviderReadiness(settings).isImageReady
    ) {
      return this.checkOnboardingStatus(ctx);
    }

    const dimensions = resolveAgentGenerationDimensions(
      DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
    );
    const body: Record<string, unknown> = {
      autoSelectModel: true,
      height: dimensions.height,
      prioritize: RouterPriority.COST,
      prompt,
      text: prompt,
      waitForCompletion: true,
      width: dimensions.width,
      ...(ctx.runId ? { workflowExecutionId: ctx.runId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
    };

    try {
      const response = toMediaResponseRecord(
        await this.generationGateway.generateImage({
          body,
          principal: {
            brandId: ctx.brandId,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
          },
        }),
      );
      const id = readMediaResponseString(response, 'id');
      const url = readUsableCdnAssetUrl(
        response,
        this.configService.ingredientsEndpoint,
      );

      if (!url) {
        throw new Error('Image generation returned no usable preview.');
      }
      if (id) {
        try {
          await this.completeJourneyMission(ctx, 'generate_first_image');
        } catch (error) {
          this.loggerService.warn(
            'Onboarding image reward could not be recorded',
            { error },
          );
        }
      }

      return {
        creditsUsed: 0,
        data: { id, status: Status.GENERATED, url },
        isBillingDelegated: true,
        success: true,
      };
    } catch (error) {
      this.loggerService.error('Onboarding image generation failed', error);
      return {
        creditsUsed: 0,
        error:
          error instanceof Error &&
          /insufficient.*credits|not enough.*credits/i.test(error.message)
            ? 'There are not enough credits to create this image. You can open your workspace to manage credits or continue with the tweet.'
            : 'The image could not be generated. Please retry, or open your workspace.',
        isBillingDelegated: true,
        success: false,
      };
    }
  }
}
