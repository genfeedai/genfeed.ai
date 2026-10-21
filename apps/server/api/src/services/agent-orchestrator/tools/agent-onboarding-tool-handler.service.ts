import { AGENT_CREATED_BRAND_VISUAL_DEFAULTS } from '@api/collections/brands/constants/agent-created-brand.constant';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import {
  buildBrandIdentityProposal,
  buildCreatedBrandAgentConfig,
  buildRecoveredCreateResult,
  isMatchingCreateRecovery,
  normalizeBrandSlug,
  readBrandLabel,
  readConfirmedBrandIdentitySourceActionId,
  readCreateBrandProposal,
  readOptionalBrandDescription,
} from '@api/services/agent-orchestrator/tools/agent-brand-identity-proposal.util';
import { completeAgentOnboarding } from '@api/services/agent-orchestrator/tools/agent-onboarding-completion.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { ByokProvider, TargetExecutionState } from '@genfeedai/contracts';
import type {
  AgentToolResult,
  AgentUiAction,
  IBrandKitResolvedAssets,
} from '@genfeedai/contracts/interfaces';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_ANSWER_TOTAL_CREDITS,
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_JOURNEY_TOTAL_CREDITS,
  ONBOARDING_TRIAL_CREDITS,
  type OnboardingJourneyMissionId,
  resolveMissionCtaHref,
} from '@genfeedai/contracts/types';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

/**
 * BYOK providers an image `generate` call can actually reach, mirroring the branches in
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
  resolveBrandKitAssets?: (
    brandId: string,
    organizationId: string,
  ) => Promise<IBrandKitResolvedAssets>;
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
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    private readonly postsService: PostsService,
    private readonly creditsUtilsService: CreditsUtilsService,
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
  ) {}

  async createBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const isConfirmed = ctx.confirmationOrigin === 'thread-ui-action';
    const proposal = readCreateBrandProposal(params, isConfirmed);

    if (!isConfirmed) {
      return buildBrandIdentityProposal('create', proposal, ctx);
    }
    const sourceActionId = readConfirmedBrandIdentitySourceActionId(
      params.sourceActionId,
    );

    if (ctx.validatedScope?.brandId) {
      const boundBrand = await this.brandsService.findOne({
        id: ctx.validatedScope.brandId,
        organizationId: ctx.organizationId,
      });
      if (isMatchingCreateRecovery(boundBrand, proposal, sourceActionId, ctx)) {
        return buildRecoveredCreateResult(boundBrand, proposal);
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
        isMatchingCreateRecovery(
          recoveredBySource,
          proposal,
          sourceActionId,
          ctx,
        )
      ) {
        return buildRecoveredCreateResult(recoveredBySource, proposal);
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
      slug: proposal.slug,
    });

    if (existing) {
      if (isMatchingCreateRecovery(existing, proposal, sourceActionId, ctx)) {
        return buildRecoveredCreateResult(existing, proposal);
      }

      return {
        creditsUsed: 0,
        error: 'A brand with this slug already exists in the organization.',
        success: false,
      };
    }

    const brand = await this.brandsService.create({
      ...AGENT_CREATED_BRAND_VISUAL_DEFAULTS,
      agentConfig: buildCreatedBrandAgentConfig(proposal, sourceActionId),
      description: proposal.description,
      label: proposal.label,
      organizationId: ctx.organizationId,
      slug: proposal.slug,
      userId: ctx.userId,
    });
    const createdSlug =
      typeof brand.slug === 'string' && brand.slug.trim()
        ? brand.slug.trim()
        : proposal.slug;

    const onboardingStatus = await this.checkOnboardingStatus(ctx);

    return {
      creditsUsed: 0,
      data: {
        created: true,
        brandId: String(brand.id),
        id: String(brand.id),
        label: proposal.label,
        slug: createdSlug,
      },
      nextActions: onboardingStatus.nextActions,
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
        ? readConfirmedBrandIdentitySourceActionId(params.sourceActionId)
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

    const currentLabel = readBrandLabel(currentBrand.label, 'Brand');
    const currentSlug = normalizeBrandSlug(currentBrand.slug, currentLabel);
    const label = readBrandLabel(params.label, currentLabel);
    const slug = normalizeBrandSlug(params.slug, label);
    const description = readOptionalBrandDescription(
      params.description,
      currentBrand.description,
    );
    const proposal = { description, label, slug };

    if (ctx.confirmationOrigin !== 'thread-ui-action') {
      return buildBrandIdentityProposal('rename', proposal, ctx, {
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
      // The trial credits land when onboarding is finished or skipped.
      totalOnboardingCreditsVisible:
        signupGiftCredits +
        ONBOARDING_TRIAL_CREDITS +
        ONBOARDING_ANSWER_TOTAL_CREDITS +
        ONBOARDING_JOURNEY_TOTAL_CREDITS,
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
      await completeAgentOnboarding(
        ctx,
        this.onboardingCreditGrantsService,
        this.organizationsService,
        this.usersService,
      );
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
    // Anthropic keys make `isReady` true while an image `generate` call still has
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
    return completeAgentOnboarding(
      ctx,
      this.onboardingCreditGrantsService,
      this.organizationsService,
      this.usersService,
    );
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
}
