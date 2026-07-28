import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolInternalApiService } from '@api/services/agent-orchestrator/tools/agent-tool-internal-api.service';
import { isEEEnabled } from '@genfeedai/config';
import { PostStatus, Status } from '@genfeedai/enums';
import type { AgentToolResult, AgentUiAction } from '@genfeedai/interfaces';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSIONS,
  ONBOARDING_JOURNEY_TOTAL_CREDITS,
  type OnboardingJourneyMissionId,
} from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { Effect } from 'effect';

interface AgentBrandsServiceLike {
  create: (
    createDto: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
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
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    private readonly postsService: PostsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly internalApi: AgentToolInternalApiService,
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
    private readonly streamPublisher?: AgentStreamPublisherService,
  ) {}

  private publishToolProgressEffect(data: {
    message: string;
    progress: number;
    threadId: string;
    toolName: string;
    userId: string;
  }) {
    if (!this.streamPublisher) {
      return Effect.void;
    }
    return this.streamPublisher.publishToolProgressEffect(data);
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

  /** Used by media generation for first-image / first-video journey rewards. */
  async createBrand(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const fallbackName = 'My Brand';
    const name = String(params.name || params.brandName || fallbackName).trim();
    const normalizedHandle = this.normalizeHandle(
      String(params.handle || ''),
      name,
    );
    const description =
      (params.description as string) ||
      (params.niche as string) ||
      `Brand profile for ${name}`;
    const voice = (params.voice as string) || 'conversational';

    const existing = await this.brandsService.findOne({
      handle: normalizedHandle,
      isDeleted: false,
      organization: ctx.organizationId,
    });

    if (existing) {
      return {
        creditsUsed: 0,
        data: {
          created: false,
          id: String(existing.id),
          message: 'Brand already exists for this organization.',
        },
        success: true,
      };
    }

    const brand = await this.brandsService.create({
      backgroundColor: '#000000',
      description: `${description} Voice: ${voice}.`,
      fontFamily: 'montserrat_black',
      handle: normalizedHandle,
      isSelected: false,
      label: name,
      organization: ctx.organizationId,
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      text: (params.niche as string) || undefined,
    } as never);

    const onboardingStatus = await this.checkOnboardingStatus(ctx);

    return {
      creditsUsed: 0,
      data: {
        created: true,
        handle: normalizedHandle,
        id: String(brand.id),
        name,
      },
      nextActions: onboardingStatus.nextActions,
      success: true,
    };
  }

  async checkOnboardingStatus(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const organizationObjectId = ctx.organizationId;

    const [brand, credential, firstImage, firstVideo, publishedPost, settings] =
      await Promise.all([
        this.brandsService.findOne({
          isDeleted: false,
          organization: organizationObjectId,
        }),
        this.credentialsService
          ? this.credentialsService.findOne({
              isConnected: true,
              isDeleted: false,
              organization: organizationObjectId,
            })
          : null,
        this.imagesService
          ? this.imagesService.findOne({
              isDeleted: false,
              organization: organizationObjectId,
            })
          : null,
        this.internalApi.callInternalFindOne(
          '/v1/videos',
          organizationObjectId.toString(),
          ctx.authToken,
        ),
        this.postsService.findOne(
          {
            isDeleted: false,
            organization: organizationObjectId,
            status: PostStatus.PUBLIC,
          },
          [],
        ),
        this.organizationSettingsService
          ? this.organizationSettingsService.findOne({
              isDeleted: false,
              organization: organizationObjectId,
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

    return {
      creditsUsed: 0,
      data: {
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
      },
      nextActions: [this.buildOnboardingChecklistCard(missions, creditBuckets)],
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
  ): AgentUiAction {
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

    return {
      checklist: ONBOARDING_JOURNEY_MISSIONS.map((mission) => {
        const state = missions.find((item) => item.id === mission.id);
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
      }),
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
      isDeleted: false,
      organization: ctx.organizationId,
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

    if (!mission || mission.rewardClaimed) {
      return;
    }

    const updatedMissions = missions.map((item) =>
      item.id === missionId
        ? {
            ...item,
            completedAt: item.completedAt ?? new Date(),
            isCompleted: true,
            rewardClaimed: true,
          }
        : item,
    );

    await this.organizationSettingsService.patch(String(settings.id), {
      onboardingJourneyMissions: updatedMissions,
    });

    await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
      ctx.organizationId,
      mission.rewardCredits,
      'onboarding-journey',
      `Onboarding journey reward: ${missionId}`,
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
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

    const nextMissions = missions.map((mission) => {
      const shouldComplete = completionMap[mission.id];
      return shouldComplete && !mission.isCompleted
        ? { ...mission, completedAt: new Date(), isCompleted: true }
        : mission;
    });

    let totalRewardCreditsGranted = 0;
    const claimedMissions = nextMissions.map((mission) => {
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
      isDeleted: false,
      organization: ctx.organizationId,
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
          _id: ctx.userId,
          isDeleted: false,
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
      // Phase C — no legacy auth provider publicMetadata write-back).
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
        _id: ctx.userId,
        isDeleted: false,
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
    // Phase C — no legacy auth provider publicMetadata write-back).

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
        await runEffectPromise(
          this.publishToolProgressEffect({
            message: `Generating tweet ${i + 1}/3...`,
            progress: i / 6,
            threadId: ctx.threadId ?? `onboarding-${brandId}`,
            toolName: 'generate_onboarding_content',
            userId: ctx.userId,
          }).pipe(Effect.catchAll(() => Effect.void)),
        );
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
        await runEffectPromise(
          this.publishToolProgressEffect({
            message: `Generating image ${i + 1}/3...`,
            progress: (3 + i) / 6,
            threadId: ctx.threadId ?? `onboarding-${brandId}`,
            toolName: 'generate_onboarding_content',
            userId: ctx.userId,
          }).pipe(Effect.catchAll(() => Effect.void)),
        );
        imageResults.push(
          await this.generateOnboardingImage(imagePrompts[i] ?? '', ctx).then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (reason: unknown) => ({ reason, status: 'rejected' as const }),
          ),
        );
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
            ctas: [{ href: '/posts/drafts', label: 'View all drafts' }],
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
    const billingHref = isEEEnabled()
      ? '/settings/billing'
      : '/settings/api-keys';
    const billingLabel = isEEEnabled()
      ? 'View all plans'
      : 'Configure providers';

    return {
      creditsUsed: 0,
      data: {
        canSkip: true,
        message: isEEEnabled()
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
  private normalizeHandle(handle: string, name: string): string {
    const raw = handle || name;
    const normalized = raw
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '');

    if (normalized.length > 0) {
      return normalized;
    }

    return `brand_${Date.now()}`;
  }

  private async generateOnboardingImage(
    prompt: string,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const dimensions = this.aspectRatioToDimensions('1:1');
    const body: Record<string, unknown> = {
      autoSelectModel: true,
      height: dimensions.height,
      prioritize: ctx.generationPriority || 'quality',
      prompt,
      text: prompt,
      waitForCompletion: true,
      width: dimensions.width,
      ...(ctx.runId ? { agentRunId: ctx.runId } : {}),
      ...(ctx.strategyId ? { agentStrategyId: ctx.strategyId } : {}),
    };

    try {
      const response = await this.internalApi.callInternalApi(
        'POST',
        '/v1/images',
        body,
        ctx,
      );
      const data =
        response.data && typeof response.data === 'object'
          ? (response.data as Record<string, unknown>)
          : response;
      const id =
        typeof data.id === 'string'
          ? data.id
          : typeof (data.attributes as Record<string, unknown> | undefined)
                ?.id === 'string'
            ? String((data.attributes as Record<string, unknown>).id)
            : undefined;
      const url =
        typeof data.cdnUrl === 'string'
          ? data.cdnUrl
          : typeof data.url === 'string'
            ? data.url
            : typeof (data.attributes as Record<string, unknown> | undefined)
                  ?.cdnUrl === 'string'
              ? String((data.attributes as Record<string, unknown>).cdnUrl)
              : undefined;

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
