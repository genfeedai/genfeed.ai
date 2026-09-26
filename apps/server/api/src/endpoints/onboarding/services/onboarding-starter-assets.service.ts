import type { BrandAgentConfig } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  AGENT_GENERATION_GATEWAY,
  type IAgentGenerationGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import {
  readMediaResponseString,
  readUsableCdnAssetUrl,
  toMediaResponseRecord,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import {
  Platform,
  PostVisibility,
  RouterPriority,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  LLM_DEFAULTS,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import type {
  IOnboardingStarterAssetsMarker,
  IOnboardingStarterAssetsResponse,
} from '@genfeedai/contracts/interfaces';
import type { OnboardingStarterAssetsJobData } from '@genfeedai/contracts/queue';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';

const TWEET_LIMIT = 280;

/** Marker key on `brand.agentConfig`, mirroring `signupPrefill`. */
const STARTER_ASSETS_MARKER_KEY = 'onboardingStarterAssets';

function readBrandText(
  brand: { description?: unknown; label?: unknown },
  key: 'description' | 'label',
): string {
  const value = brand[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function clampOnboardingTweet(value: string): string | null {
  const compact = value
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return null;
  if (compact.length <= TWEET_LIMIT) return compact;
  const sliced = compact.slice(0, TWEET_LIMIT);
  const boundary = sliced.lastIndexOf(' ');
  return (boundary > 180 ? sliced.slice(0, boundary) : sliced).trim();
}

/**
 * Drafts one tweet and one cost-priority ad in parallel for the domain
 * loading onboarding step. Either asset can fail without failing the other.
 *
 * Runs off the `ONBOARDING_STARTER_ASSETS_QUEUE` (see
 * `OnboardingStarterAssetsProcessor` in the workers app) so the loading step
 * never blocks on generation. Progress and failures are persisted on
 * `brand.agentConfig.onboardingStarterAssets` — the same marker pattern
 * `SignupPrefillService` uses for the domain-prefill job — so a failure is
 * durably recorded instead of only living in worker logs.
 */
@Injectable()
export class OnboardingStarterAssetsService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly postsService: PostsService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly configService: ConfigService,
    @Inject(AGENT_GENERATION_GATEWAY)
    private readonly generationGateway: IAgentGenerationGateway,
  ) {}

  /**
   * Entry point for the queue processor. Validates brand ownership, runs
   * generation, and always leaves a terminal marker on the brand — even when
   * generation throws — so the failure is surfaced rather than swallowed.
   */
  async generateForJob(
    data: OnboardingStarterAssetsJobData,
  ): Promise<IOnboardingStarterAssetsResponse> {
    await this.writeMarker(data.brandId, data.organizationId, {
      startedAt: new Date().toISOString(),
      status: 'running',
    });

    try {
      const result = await this.generate(data);
      await this.writeMarker(data.brandId, data.organizationId, {
        completedAt: new Date().toISOString(),
        result,
        status: 'completed',
      });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.loggerService.error('Onboarding starter assets job failed', {
        brandId: data.brandId,
        error: message,
        organizationId: data.organizationId,
      });
      await this.writeMarker(data.brandId, data.organizationId, {
        completedAt: new Date().toISOString(),
        error: message,
        status: 'failed',
      });
      throw error;
    }
  }

  async generate(
    input: OnboardingStarterAssetsJobData,
  ): Promise<IOnboardingStarterAssetsResponse> {
    const { brandId, organizationId, userId } = input;

    const brand = await this.brandsService.findOne(
      {
        id: brandId,
        isDeleted: false,
        organizationId,
      },
      'none',
    );
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    const brandName = readBrandText(brand, 'label') || 'your brand';
    const description = readBrandText(brand, 'description');
    const websiteUrl = input.websiteUrl?.trim() ?? '';
    const [tweetResult, adResult] = await Promise.allSettled([
      this.writeTweet({
        brandName,
        description,
        organizationId,
        userId,
        websiteUrl,
      }),
      this.writeAd({
        brandId,
        brandName,
        description,
        organizationId,
        userId,
        websiteUrl,
      }),
    ]);

    const tweet = tweetResult.status === 'fulfilled' ? tweetResult.value : null;
    const ad = adResult.status === 'fulfilled' ? adResult.value : null;
    if (tweetResult.status === 'rejected') {
      this.loggerService.warn('Onboarding tweet draft failed', {
        error: tweetResult.reason,
      });
    }
    if (adResult.status === 'rejected') {
      this.loggerService.warn('Onboarding ad draft failed', {
        error: adResult.reason,
      });
    }

    const postId =
      tweet || ad?.id
        ? await this.saveDraft({
            brandId,
            brandName,
            imageId: ad?.id ?? null,
            organizationId,
            tweet,
            userId,
          })
        : null;

    return {
      adImageUrl: ad?.url ?? null,
      postId,
      tweet,
    };
  }

  private async writeTweet(input: {
    brandName: string;
    description: string;
    organizationId: string;
    userId: string;
    websiteUrl: string;
  }): Promise<string | null> {
    const response = await this.llmDispatcherService.chatCompletion(
      {
        max_tokens: 180,
        messages: [
          {
            content:
              'Write one standalone tweet of at most 240 characters. Use the company name and what it offers. Do not invent metrics, prices, testimonials, discounts, hashtags, or URLs. Return the tweet only.',
            role: 'system',
          },
          {
            content: [
              `Brand: ${input.brandName}.`,
              input.websiteUrl ? `Website: ${input.websiteUrl}.` : '',
              input.description ? `Context: ${input.description}.` : '',
            ]
              .filter(Boolean)
              .join('\n'),
            role: 'user',
          },
        ],
        model: LLM_DEFAULTS.grokFast,
        temperature: 0.4,
      },
      input.organizationId,
      { userId: input.userId },
    );
    return clampOnboardingTweet(response.choices[0]?.message.content ?? '');
  }

  private async writeAd(input: {
    brandId: string;
    brandName: string;
    description: string;
    organizationId: string;
    userId: string;
    websiteUrl: string;
  }): Promise<{ id: string | null; url: string | null }> {
    const dimensions = resolveAgentGenerationDimensions(
      DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
    );
    const prompt = [
      `Create one square ad image for ${input.brandName}.`,
      input.websiteUrl ? `Website: ${input.websiteUrl}.` : '',
      input.description ? `Context: ${input.description}.` : '',
      'Show the offering with a clear focal point and intentional composition.',
      'No text, logos, watermarks, or stock-photo cliches.',
    ]
      .filter(Boolean)
      .join(' ');
    const response = toMediaResponseRecord(
      await this.generationGateway.generateImage({
        body: {
          autoSelectModel: true,
          height: dimensions.height,
          prioritize: RouterPriority.COST,
          prompt,
          text: prompt,
          waitForCompletion: true,
          width: dimensions.width,
        },
        creditsAttribution: { description: 'Onboarding starter ad' },
        originalPrompt: prompt,
        principal: {
          brandId: input.brandId,
          organizationId: input.organizationId,
          userId: input.userId,
        },
      }),
    );
    return {
      id: readMediaResponseString(response, 'id') ?? null,
      url:
        readUsableCdnAssetUrl(
          response,
          this.configService.ingredientsEndpoint,
        ) ?? null,
    };
  }

  private async saveDraft(input: {
    brandId: string;
    brandName: string;
    imageId: string | null;
    organizationId: string;
    tweet: string | null;
    userId: string;
  }): Promise<string | null> {
    try {
      const post = await this.postsService.create({
        brandId: input.brandId,
        description: input.tweet ?? `First ad for ${input.brandName}`,
        ingredients: input.imageId ? [input.imageId] : [],
        label: `First post for ${input.brandName}`.slice(0, 200),
        organizationId: input.organizationId,
        platform: Platform.TWITTER,
        targetExecutionState: TargetExecutionState.DRAFT,
        userId: input.userId,
        visibility: PostVisibility.PUBLIC,
      });
      return post.id;
    } catch (error) {
      this.loggerService.warn('Onboarding starter draft was not saved', {
        error,
      });
      return null;
    }
  }

  private readMarker(
    config: BrandAgentConfig,
  ): IOnboardingStarterAssetsMarker | undefined {
    const marker = config[STARTER_ASSETS_MARKER_KEY];

    if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
      return undefined;
    }

    return marker as IOnboardingStarterAssetsMarker;
  }

  private async writeMarker(
    brandId: string,
    organizationId: string,
    marker: Partial<IOnboardingStarterAssetsMarker> &
      Pick<IOnboardingStarterAssetsMarker, 'status'>,
  ): Promise<void> {
    try {
      const brand = await this.brandsService.findOne(
        { id: brandId, organizationId },
        'none',
      );
      if (!brand) {
        return;
      }

      const config = (brand.agentConfig ?? {}) as BrandAgentConfig;
      await this.brandsService.updateAgentConfig(brandId, organizationId, {
        ...config,
        [STARTER_ASSETS_MARKER_KEY]: {
          ...(this.readMarker(config) ?? {}),
          ...marker,
        },
      });
    } catch (error: unknown) {
      this.loggerService.warn('Could not record starter-assets marker', {
        brandId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
