import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { readOnboardingAnswersProgress } from '@api/collections/brands/utils/onboarding-answers-progress.util';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import type {
  OnboardingDraftContextDto,
  OnboardingDraftsDto,
} from '@api/endpoints/onboarding/dto/onboarding-first-drafts.dto';
import type {
  OnboardingImageBriefInput,
  OnboardingMissingMedia,
} from '@api/endpoints/onboarding/onboarding.interfaces';
import { OnboardingDraftRunsService } from '@api/endpoints/onboarding/services/onboarding-draft-runs.service';
import { buildOnboardingImageBrief } from '@api/endpoints/onboarding/utils/onboarding-image-brief.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { buildFirstRunOnboardingImageBody } from '@api/helpers/utils/first-run-image-generation/first-run-image-generation.util';
import {
  AGENT_GENERATION_GATEWAY,
  type IAgentGenerationGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import {
  readMediaResponseString,
  readUsableCdnAssetUrl,
  toMediaResponseRecord,
} from '@api/services/agent-orchestrator/tools/agent-media-generation-response-readers';
import { BrandWebsiteParserService } from '@api/services/brand-scraper/brand-website-parser.service';
import { SignupPrefillService } from '@api/services/signup-prefill/signup-prefill.service';
import { normalizeOnboardingUrl } from '@api/services/signup-prefill/utils/normalize-onboarding-url.util';
import { Platform, RouterPriority } from '@genfeedai/contracts';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  ONBOARDING_DRAFT_PLATFORMS,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import type {
  IOnboardingFirstDraft,
  IOnboardingFirstDraftsResult,
  IOnboardingScanResult,
  OnboardingDraftPlatform,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';

function isInsufficientCredits(error: unknown): boolean {
  if (!(error instanceof HttpException)) return false;
  return (
    error.getStatus() === HttpStatus.PAYMENT_REQUIRED ||
    (error instanceof BusinessLogicException &&
      error.errorCode === 'INSUFFICIENT_CREDITS')
  );
}

const PLATFORM_BY_DRAFT: Record<OnboardingDraftPlatform, Platform> = {
  instagram: Platform.INSTAGRAM,
  linkedin: Platform.LINKEDIN,
  tiktok: Platform.TIKTOK,
  twitter: Platform.TWITTER,
};

/** How each channel's draft differs from the X post it is derived from. */
const PLATFORM_FORMAT_BRIEF: Record<
  Exclude<OnboardingDraftPlatform, 'twitter'>,
  string
> = {
  instagram:
    'Write an Instagram caption: a hook on the first line, two or three short lines, and at most three relevant hashtags.',
  linkedin:
    'Write a LinkedIn post: a plain-spoken opener, a few short paragraphs, and no hashtags or emoji.',
  tiktok:
    'Write a short TikTok caption: one strong hook, a few concise lines, and no stage directions.',
};

const TONE_DIRECTION: Record<
  NonNullable<OnboardingDraftContextDto['tone']>,
  string
> = {
  casual: 'Make the tone more casual and conversational.',
  keep: '',
  professional: 'Make the tone more professional and precise.',
};

/**
 * The first-run drafts: one post each for X, Instagram, TikTok and LinkedIn from
 * a cheap text model, plus one image shared by the posts that carry one. Every
 * draft is saved as a DRAFT post bound to a branded-generation receipt; nothing
 * is published and no account needs to be connected.
 */
@Injectable()
export class OnboardingFirstDraftsService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    private readonly brandsService: BrandsService,
    private readonly brandDataMapper: BrandDataMapper,
    private readonly postGenerationService: PostGenerationService,
    private readonly signupPrefillService: SignupPrefillService,
    @Inject(AGENT_GENERATION_GATEWAY)
    private readonly generationGateway: IAgentGenerationGateway,
    private readonly runs: OnboardingDraftRunsService,
  ) {}

  /** Reads a public link and prefills the brand. Failures are reported, never thrown. */
  async scan(
    user: User,
    brandId: string,
    url: string,
  ): Promise<IOnboardingScanResult> {
    const organizationId = String(user.organizationId);
    const userId = String(user.id);
    let sourceUrl = '';
    try {
      sourceUrl = normalizeOnboardingUrl(url);
      const state = await this.signupPrefillService.scanBrandUrl(
        { brandId, organizationId, userId },
        sourceUrl,
      );
      if (state.scrapeStatus !== 'scraped' || !state.summary) {
        const reason = state.scrapeReason ?? 'scrape_failed';
        this.loggerService.log('Onboarding brand scan', {
          brandId,
          outcome: 'failed',
          reason,
        });
        return { reason, status: 'failed' };
      }
      this.loggerService.log('Onboarding brand scan', {
        brandId,
        outcome: 'scanned',
      });
      return { status: 'scanned', summary: state.summary };
    } catch (error: unknown) {
      this.loggerService.warn('Onboarding brand scan failed', {
        brandId,
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        sourceUrl: new BrandWebsiteParserService().sanitizeProvenanceUrl(
          sourceUrl,
        ),
      });
      return {
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
        status: 'failed',
      };
    }
  }

  read(user: User, brandId: string) {
    return this.runs.latest(user, brandId);
  }

  async generate(
    user: User,
    brandId: string,
    dto: OnboardingDraftsDto,
  ): Promise<IOnboardingFirstDraftsResult> {
    return this.runs.execute(user, brandId, dto.previousRequestKey, (save) =>
      this.generateOnce(user, brandId, dto, save),
    );
  }

  private async generateOnce(
    user: User,
    brandId: string,
    dto: OnboardingDraftsDto,
    save: (result: IOnboardingFirstDraftsResult) => Promise<void>,
  ): Promise<IOnboardingFirstDraftsResult> {
    const organizationId = String(user.organizationId);
    const userId = String(user.id);
    const brand = await this.brandsService.findOne(
      { id: brandId, isDeleted: false, organizationId },
      'none',
    );
    if (!brand) throw new NotFoundException('Brand');

    if (dto.context)
      await this.saveContext(brand, brandId, organizationId, dto.context);
    const direction = this.describeContext(dto.context);
    const { brandName, description, imageContext } = this.readBrandContext(
      brand,
      dto.context,
    );
    const identity = { brandId, organizationId, userId };

    const xDraft = await this.generateDraft({
      direction,
      identity,
      platform: 'twitter',
      previousRequestKey: dto.previousRequestKey,
      prompt: [
        'Introduce the brand with a useful, specific post grounded in its saved offering.',
        ...(direction ? [`Apply these requested changes: ${direction}`] : []),
      ].join(' '),
    }).catch((error: unknown) => {
      this.loggerService.error('Onboarding X draft failed', error);
      return null;
    });
    if (!xDraft) {
      return {
        drafts: [],
        imageIngredientId: null,
        imageUrl: null,
        requestKey: null,
        status: 'unavailable',
      };
    }

    const result: IOnboardingFirstDraftsResult = {
      drafts: [xDraft],
      imageIngredientId: null,
      imageUrl: null,
      requestKey: xDraft.requestKey,
      status: 'partial',
      videoIngredientId: null,
      videoUrl: null,
      videoStatus: 'pending',
    };
    let writes = Promise.resolve();
    const checkpoint = () => {
      const snapshot = structuredClone(result);
      writes = writes.then(() => save(snapshot));
      return writes;
    };
    await checkpoint();
    const otherPlatforms = ONBOARDING_DRAFT_PLATFORMS.filter(
      (platform): platform is Exclude<OnboardingDraftPlatform, 'twitter'> =>
        platform !== 'twitter',
    );
    await Promise.all([
      this.generateImage({
        brandName,
        description,
        identity,
        imageContext,
        tweet: xDraft.text,
        onPlaceholderCreated: async (ingredientId) => {
          result.imageIngredientId = ingredientId;
          await checkpoint();
        },
      }).then(async (image) => {
        result.imageIngredientId =
          image.ingredientId ?? result.imageIngredientId;
        result.imageUrl = image.url;
        await checkpoint();
      }),
      ...otherPlatforms.map(async (platform) => {
        const draft = await this.generateDraft({
          direction,
          identity,
          platform,
          prompt: [
            PLATFORM_FORMAT_BRIEF[platform],
            `Base it on the same idea as this X post: ${xDraft.text}`,
            ...(direction
              ? [`Apply these requested changes: ${direction}`]
              : []),
          ].join(' '),
        }).catch((error: unknown) => {
          this.loggerService.warn('Onboarding platform draft failed', {
            error: error instanceof Error ? error.message : String(error),
            platform,
          });
          return null;
        });
        if (draft) {
          result.drafts.push(draft);
          await checkpoint();
        }
      }),
    ]);
    result.drafts.sort(
      (left, right) =>
        ONBOARDING_DRAFT_PLATFORMS.indexOf(left.platform) -
        ONBOARDING_DRAFT_PLATFORMS.indexOf(right.platform),
    );
    result.status =
      result.drafts.length === ONBOARDING_DRAFT_PLATFORMS.length &&
      result.imageUrl
        ? 'ready'
        : 'partial';
    await checkpoint();
    await this.generateVideo(identity, brandName, result, checkpoint);
    result.status = this.resolveStatus(result);
    return result;
  }

  /** Regenerates only the image or video a finished run is missing. */
  async retryMedia(
    user: User,
    brandId: string,
  ): Promise<IOnboardingFirstDraftsResult> {
    return this.runs.retryMedia(user, brandId, (missing, result, save) =>
      this.retryMediaOnce(user, brandId, missing, result, save),
    );
  }

  private async retryMediaOnce(
    user: User,
    brandId: string,
    missing: OnboardingMissingMedia,
    result: IOnboardingFirstDraftsResult,
    save: (result: IOnboardingFirstDraftsResult) => Promise<void>,
  ): Promise<IOnboardingFirstDraftsResult> {
    const organizationId = String(user.organizationId);
    const brand = await this.brandsService.findOne(
      { id: brandId, isDeleted: false, organizationId },
      'none',
    );
    if (!brand) throw new NotFoundException('Brand');
    const { brandName, description, imageContext } =
      this.readBrandContext(brand);
    const identity = { brandId, organizationId, userId: String(user.id) };
    let writes = Promise.resolve();
    const checkpoint = () => {
      const snapshot = structuredClone(result);
      writes = writes.then(() => save(snapshot));
      return writes;
    };
    await checkpoint();
    if (missing.image) {
      const image = await this.generateImage({
        brandName,
        description,
        identity,
        imageContext,
        tweet: (
          result.drafts.find((draft) => draft.platform === 'twitter') ??
          result.drafts[0]
        ).text,
        onPlaceholderCreated: async (ingredientId) => {
          result.imageIngredientId = ingredientId;
          await checkpoint();
        },
      });
      result.imageIngredientId = image.ingredientId ?? result.imageIngredientId;
      result.imageUrl = image.url;
      await checkpoint();
    }
    if (missing.video)
      await this.generateVideo(identity, brandName, result, checkpoint);
    result.status = this.resolveStatus(result);
    return result;
  }

  private readBrandContext(
    brand: { agentConfig?: unknown; description?: unknown; label?: unknown },
    context?: OnboardingDraftContextDto,
  ) {
    const savedConfig = this.brandDataMapper.readBrandAgentConfig(
      brand.agentConfig,
    );
    return {
      brandName:
        typeof brand.label === 'string' && brand.label
          ? brand.label
          : 'your brand',
      description:
        typeof brand.description === 'string' ? brand.description : '',
      imageContext: {
        audience: context?.audience ?? savedConfig.voice?.audience?.[0],
        goals: context?.goals ?? savedConfig.strategy?.goals,
        offer: context?.offer ?? savedConfig.strategy?.offers?.[0],
        tone:
          context?.tone && context.tone !== 'keep'
            ? context.tone
            : savedConfig.voice?.tone,
      },
    };
  }

  private resolveStatus(
    result: IOnboardingFirstDraftsResult,
  ): IOnboardingFirstDraftsResult['status'] {
    return result.drafts.length === ONBOARDING_DRAFT_PLATFORMS.length &&
      result.imageUrl &&
      result.videoStatus === 'ready'
      ? 'ready'
      : 'partial';
  }

  private async generateVideo(
    identity: Pick<User, 'organizationId' | 'brandId' | 'userId'>,
    brandName: string,
    result: IOnboardingFirstDraftsResult,
    checkpoint: () => Promise<void>,
  ): Promise<void> {
    const { brandId } = identity;
    const script = result.drafts.find((draft) => draft.platform === 'tiktok');
    if (script) {
      try {
        const response = toMediaResponseRecord(
          await this.generationGateway.generateVideo({
            principal: identity,
            body: {
              brandId,
              prompt: `Create a vertical brand clip with natural motion and no invented text or logos. Brand: ${brandName}. Idea: ${script.text}`,
              text: script.text,
              duration: 5,
              width: 720,
              height: 1280,
              autoSelectModel: true,
              prioritize: RouterPriority.COST,
              waitForCompletion: true,
              ...(result.imageIngredientId
                ? { references: [result.imageIngredientId] }
                : {}),
            },
            onPlaceholderCreated: async (placeholder) => {
              result.videoIngredientId = placeholder;
              await checkpoint();
            },
          }),
        );
        result.videoIngredientId =
          readMediaResponseString(response, 'id') ?? result.videoIngredientId;
        result.videoUrl =
          readUsableCdnAssetUrl(
            response,
            this.configService.ingredientsEndpoint,
          ) ?? null;
        result.videoStatus = result.videoUrl
          ? 'ready'
          : readMediaResponseString(response, 'status')?.toLowerCase() ===
              'processing'
            ? 'pending'
            : 'failed';
      } catch (error) {
        // Credits are checked before any charge, so a short wallet means the
        // video was never started: say so instead of calling it a failure.
        if (isInsufficientCredits(error)) {
          this.loggerService.warn('Onboarding video skipped: no credits', {
            brandId,
          });
          result.videoIngredientId = null;
          result.videoStatus = 'needs_credits';
          return;
        }
        this.loggerService.error('Onboarding video generation failed', error, {
          brandId,
        });
        result.videoStatus = 'failed';
      }
    } else result.videoStatus = 'failed';
  }

  private describeContext(context?: OnboardingDraftContextDto): string {
    if (!context) return '';
    return [
      context.audience ? `Write for this audience: ${context.audience}.` : '',
      context.offer ? `The brand offers: ${context.offer}.` : '',
      context.goals?.length
        ? `The posts should work toward: ${context.goals.join(', ')}.`
        : '',
      context.tone ? TONE_DIRECTION[context.tone] : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /** Persists the answers on the brand so later generations keep using them. */
  private async saveContext(
    brand: { agentConfig?: unknown },
    brandId: string,
    organizationId: string,
    context: OnboardingDraftContextDto,
  ): Promise<void> {
    const config = this.brandDataMapper.readBrandAgentConfig(brand.agentConfig);
    const progress = readOnboardingAnswersProgress(config);
    const updatedAt = new Date().toISOString();
    const isToneWritten = context.tone !== undefined && context.tone !== 'keep';
    if (context.goals?.length)
      progress.fields.goals = { status: 'answered', updatedAt };
    if (context.audience)
      progress.fields.audience = { status: 'answered', updatedAt };
    if (context.offer)
      progress.fields.offer = { status: 'answered', updatedAt };
    if (context.tone) progress.fields.tone = { status: 'answered', updatedAt };
    await this.brandsService.updateAgentConfig(brandId, organizationId, {
      onboardingAnswers: {
        fields: progress.fields,
        ...(progress.voiceSource ? { voiceSource: progress.voiceSource } : {}),
      },
      strategy: {
        ...config.strategy,
        ...(context.goals?.length ? { goals: context.goals } : {}),
        ...(context.offer ? { offers: [context.offer] } : {}),
      },
      ...(isToneWritten || context.audience
        ? {
            voice: {
              ...config.voice,
              ...(isToneWritten ? { tone: context.tone } : {}),
              ...(context.audience ? { audience: [context.audience] } : {}),
            },
          }
        : {}),
    });
  }

  /**
   * A receipt-backed draft: the server decides whether it is written from the
   * approved kit or provisionally, saves it as a DRAFT post and links a
   * regeneration to the version it replaces.
   */
  private async generateDraft(input: {
    direction: string;
    identity: { brandId: string; organizationId: string; userId: string };
    platform: OnboardingDraftPlatform;
    previousRequestKey?: string;
    prompt: string;
  }): Promise<IOnboardingFirstDraft> {
    const requestKey = randomUUID();
    const result = await this.postGenerationService.generateDraftText(
      {
        brandId: input.identity.brandId,
        platform: PLATFORM_BY_DRAFT[input.platform],
        prompt: input.prompt,
        requestKey,
      },
      input.identity,
      undefined,
      { parentRequestId: input.previousRequestKey, surface: 'onboarding' },
    );
    const text = result.description.trim();
    if (!text) throw new Error('The text generator returned no draft.');
    return {
      isProvisional: result.brandedReceipt.state !== 'ready',
      platform: input.platform,
      postId: result.postId,
      receiptId: result.brandedReceipt.id,
      requestKey,
      text,
    };
  }

  /** One cost-priority image for the posts that carry one; nulls when it fails. */
  private async generateImage(input: {
    brandName: string;
    description: string;
    identity: { brandId: string; organizationId: string; userId: string };
    imageContext: Pick<
      OnboardingImageBriefInput,
      'audience' | 'goals' | 'offer' | 'tone'
    >;
    tweet: string;
    onPlaceholderCreated?: (ingredientId: string) => Promise<void>;
  }): Promise<{ ingredientId: string | null; url: string | null }> {
    const dimensions = resolveAgentGenerationDimensions(
      DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
    );
    try {
      const brief = buildOnboardingImageBrief({
        ...input.imageContext,
        brandName: input.brandName,
        description: input.description,
        post: input.tweet,
      });
      const body = await buildFirstRunOnboardingImageBody({
        brandId: input.identity.brandId,
        height: dimensions.height,
        nodeEnv: this.configService.get('NODE_ENV'),
        onReferenceError: (error) =>
          this.loggerService.warn('Onboarding image skipped brand references', {
            brandId: input.identity.brandId,
            error: error instanceof Error ? error.message : String(error),
          }),
        organizationId: input.identity.organizationId,
        prompt: brief.prompt,
        resolveBrandKitAssets: this.brandsService.resolveBrandKitAssets.bind(
          this.brandsService,
        ),
        slots: brief.slots,
        width: dimensions.width,
      });
      const response = toMediaResponseRecord(
        await this.generationGateway.generateImage({
          body,
          onPlaceholderCreated: input.onPlaceholderCreated,
          principal: input.identity,
        }),
      );
      return {
        ingredientId: readMediaResponseString(response, 'id') ?? null,
        url:
          readUsableCdnAssetUrl(
            response,
            this.configService.ingredientsEndpoint,
          ) ?? null,
      };
    } catch (error: unknown) {
      this.loggerService.error('Onboarding image generation failed', error, {
        brandId: input.identity.brandId,
      });
      return { ingredientId: null, url: null };
    }
  }
}
