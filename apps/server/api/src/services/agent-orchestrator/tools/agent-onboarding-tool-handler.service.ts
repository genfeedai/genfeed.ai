import { randomUUID } from 'node:crypto';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
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
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
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

interface ContentGeneratorTextServiceLike {
  generateText: (params: Record<string, unknown>) => Promise<{ text?: string }>;
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

  private aspectRatioToDimensions(ratio: string): {
    width: number;
    height: number;
  } {
    const map: Record<string, { width: number; height: number }> = {
      '1:1': { height: 1024, width: 1024 },
      '3:4': { height: 1365, width: 1024 },
      '4:3': { height: 768, width: 1024 },
      '9:16': { height: 1024, width: 576 },
      '16:9': { height: 576, width: 1024 },
    };
    return map[ratio] || map['1:1'];
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
    const description =
      ctx.confirmationOrigin === 'thread-ui-action'
        ? this.readOptionalBrandDescription(
            params.description,
            `Brand profile for ${label}`,
          )
        : this.buildProposedDescription(params, label);
    const proposal = { description, label, slug };

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
      text: (params.niche as string) || undefined,
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
    proposal: { description: string; label: string; slug: string },
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
    proposal: { description: string; label: string; slug: string },
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
    proposal: { description: string; label: string; slug: string },
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
    params: Record<string, unknown>,
    label: string,
  ): string {
    const base = this.readOptionalBrandDescription(
      params.description,
      params.niche,
    );
    const description = base || `Brand profile for ${label}`;
    const voice =
      typeof params.voice === 'string' && params.voice.trim()
        ? params.voice.trim()
        : 'conversational';

    return `${this.trimSentenceEnd(description)}. Voice: ${this.trimSentenceEnd(voice)}.`;
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
    if (!this.organizationSettingsService) {
      return;
    }

    const settings = await this.organizationSettingsService.findOne({
      organizationId: ctx.organizationId,
    });

    if (!settings?.id) {
      return;
    }

    const missions = this.organizationSettingsService.normalizeJourneyState(
      settings.onboardingJourneyMissions as unknown as
        | IOnboardingJourneyMissionState[]
        | undefined,
    );
    const mission = missions.find((item) => item.id === missionId);

    const isSelfHosted = isSelfHostedDeployment();

    if (!mission || (!isSelfHosted && mission.rewardClaimed)) {
      return;
    }

    const updatedMissions = missions.map((item) =>
      item.id === missionId
        ? {
            ...item,
            completedAt: item.completedAt ?? new Date(),
            isCompleted: true,
            rewardClaimed: !isSelfHosted,
            rewardCredits: isSelfHosted ? 0 : item.rewardCredits,
          }
        : item,
    );

    await this.organizationSettingsService.patch(String(settings.id), {
      onboardingJourneyMissions: updatedMissions,
    });

    if (!isSelfHosted) {
      await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
        ctx.organizationId,
        mission.rewardCredits,
        'onboarding-journey',
        `Onboarding journey reward: ${missionId}`,
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      );
    }
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

    const nextMissions = missions.map((mission) => {
      const shouldComplete = completionMap[mission.id];
      return shouldComplete && !mission.isCompleted
        ? { ...mission, completedAt: new Date(), isCompleted: true }
        : mission;
    });

    const isSelfHosted = isSelfHostedDeployment();
    let totalRewardCreditsGranted = 0;
    const claimedMissions = isSelfHosted
      ? nextMissions.map((mission) => ({
          ...mission,
          rewardClaimed: false,
          rewardCredits: 0,
        }))
      : nextMissions.map((mission) => {
          if (mission.isCompleted && !mission.rewardClaimed) {
            totalRewardCreditsGranted += mission.rewardCredits;
            return { ...mission, rewardClaimed: true };
          }

          return mission;
        });

    const earnedCredits = claimedMissions
      .filter((mission) => mission.rewardClaimed)
      .reduce((total, mission) => total + mission.rewardCredits, 0);
    const journeyCompleted = claimedMissions.every(
      (mission) => mission.isCompleted,
    );
    const currentSettings = await this.organizationSettingsService.findOne({
      organizationId: ctx.organizationId,
    });

    if (currentSettings?.id) {
      await this.organizationSettingsService.patch(String(currentSettings.id), {
        onboardingJourneyCompletedAt: journeyCompleted
          ? currentSettings.onboardingJourneyCompletedAt || new Date()
          : null,
        onboardingJourneyMissions: claimedMissions,
      });
    }

    if (totalRewardCreditsGranted > 0) {
      await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
        ctx.organizationId,
        totalRewardCreditsGranted,
        'onboarding-journey',
        'Onboarding journey reward',
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      );
    }

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

  /**
   * Generates sample onboarding content (3 tweets + 3 images) using cheap models.
   * Credits are deducted from the user's balance via the internal API endpoints
   * (CreditsInterceptor), including any onboarding journey credits already earned.
   * Uses brand voice/style from scraping for personalized content.
   */
  async generateOnboardingContent(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = params.brandId as string;
    const brandName = (params.brandName as string) || 'your brand';
    const brandDescription = (params.brandDescription as string) || '';

    try {
      // Generate 3 tweets using brand context
      const tweetTopics = [
        `Engaging tweet about ${brandName}'s value proposition${brandDescription ? `: ${brandDescription}` : ''}`,
        `Behind-the-scenes or authentic story tweet for ${brandName}`,
        `Call-to-action or community engagement tweet for ${brandName}`,
      ];

      const tweets: string[] = [];
      for (let i = 0; i < tweetTopics.length; i++) {
        const topic = tweetTopics[i];
        try {
          await this.publishToolProgress({
            message: `Generating tweet ${i + 1}/3...`,
            progress: i / 6,
            threadId: ctx.threadId ?? `onboarding-${brandId}`,
            toolName: 'generate_onboarding_content',
            userId: ctx.userId,
          });
        } catch (error) {
          this.loggerService.warn(
            'generateOnboardingContent tweet progress publish failed',
            { error },
          );
        }
        const result = await (
          this
            .contentGeneratorService as unknown as ContentGeneratorTextServiceLike
        ).generateText({
          brandId,
          organizationId: ctx.organizationId,
          platform: 'twitter',
          topic,
          type: 'post',
        });
        tweets.push(result.text || '');
      }

      // Generate 3 images sequentially using brand-aware prompts
      const imagePrompts = [
        `Professional brand lifestyle photo for ${brandName}, social media ready, high quality`,
        `Clean product or service showcase for ${brandName}, modern aesthetic`,
        `Engaging visual content for ${brandName} social media campaign`,
      ];

      const imageResults: PromiseSettledResult<AgentToolResult>[] = [];
      for (let i = 0; i < imagePrompts.length; i++) {
        try {
          await this.publishToolProgress({
            message: `Generating image ${i + 1}/3...`,
            progress: (3 + i) / 6,
            threadId: ctx.threadId ?? `onboarding-${brandId}`,
            toolName: 'generate_onboarding_content',
            userId: ctx.userId,
          });
        } catch (error) {
          this.loggerService.warn(
            'generateOnboardingContent image progress publish failed',
            { error },
          );
        }
        const imageResult = await this.generateOnboardingImage(
          imagePrompts[i] ?? '',
          ctx,
        ).then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason: unknown) => ({ reason, status: 'rejected' as const }),
        );
        if (
          imageResult.status === 'fulfilled' &&
          imageResult.value.nextActions?.some(
            (action) => action.type === 'onboarding_checklist_card',
          )
        ) {
          return imageResult.value;
        }
        imageResults.push(imageResult);
      }

      const images: string[] = imageResults
        .filter(
          (r): r is PromiseFulfilledResult<AgentToolResult> =>
            r.status === 'fulfilled' && r.value.success && !!r.value.data?.url,
        )
        .map((r) => r.value.data?.url as string);

      return {
        creditsUsed: 0,
        data: {
          images,
          message: `Generated ${tweets.length} tweets and ${images.length} images for ${brandName}.`,
          tweets,
        },
        nextActions: [
          {
            ctas: [
              {
                href: '/publishing/posts?publicationState=not-posted',
                label: 'View all drafts',
              },
            ],
            description: `Sample content generated for ${brandName}`,
            id: `onboarding-content-${Date.now()}`,
            images,
            title: `${tweets.length} tweets + ${images.length} images generated`,
            tweets,
            type: 'content_preview_card',
          },
        ],
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error('generateOnboardingContent failed', error);
      return {
        creditsUsed: 0,
        error: 'Failed to generate sample content',
        success: false,
      };
    }
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

    const dimensions = this.aspectRatioToDimensions('1:1');
    const body: Record<string, unknown> = {
      autoSelectModel: true,
      height: dimensions.height,
      prioritize: ctx.generationPriority || RouterPriority.QUALITY,
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

      if (id) {
        await this.completeJourneyMission(ctx, 'generate_first_image');
      }

      return {
        creditsUsed: 0,
        data: { id, status: Status.GENERATED, url },
        isBillingDelegated: true,
        success: true,
      };
    } catch {
      return {
        creditsUsed: 0,
        data: { status: Status.PROCESSING },
        isBillingDelegated: true,
        success: true,
      };
    }
  }
}
