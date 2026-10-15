import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { resolveGenerationBrandIdForCaller } from '@api/collections/api-keys/utils/resolve-generation-brand-for-caller.util';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { MembersService } from '@api/collections/members/services/members.service';
import { EnhancePostDto } from '@api/collections/posts/dto/enhance-post.dto';
import { ExpandToThreadDto } from '@api/collections/posts/dto/expand-thread.dto';
import { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import { GenerateHooksDto } from '@api/collections/posts/dto/generate-hooks.dto';
import { type PostDocument } from '@api/collections/posts/post.schema';
import { PostAccountGenerationService } from '@api/collections/posts/services/post-account-generation.service';
import {
  type PostDraftGenerationOptions,
  PostDraftGenerationService,
} from '@api/collections/posts/services/post-draft-generation.service';
import { extractPostGenerationLabel } from '@api/collections/posts/services/post-generation-text.util';
import { PostThreadGenerationService } from '@api/collections/posts/services/post-thread-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import type { TextDispatchKeyResolver } from '@api/services/byok/text-dispatch-byok.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ModelCategory,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/contracts';
import type {
  PostDraftGenerationInput,
  PostDraftGenerationResult,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Identity fields threaded through the generation pipeline. Derived from
 * {@link AuthenticatedUser} so callers can pass the resolved request metadata
 * directly without constructing a bespoke shape.
 */
type GenerationMetadata = Pick<
  AuthenticatedUser,
  'brandId' | 'organizationId' | 'userId' | 'isApiKey' | 'scopes'
>;

/**
 * Stable facade for post AI generation: receipt-backed account and thread
 * runs, delegated thread expansion, enhancement, hook variations, and shared text
 * helpers. Extracted from
 * `PostsOperationsController` so the controller stays a thin HTTP boundary
 * (issue #691), mirroring the existing posts analytics service split.
 */
@Injectable()
export class PostGenerationService {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly brandsService: BrandsService,
    private readonly membersService: MembersService,
    private readonly postAccountGenerationService: PostAccountGenerationService,
    private readonly postDraftGenerationService: PostDraftGenerationService,
    private readonly postThreadGenerationService: PostThreadGenerationService,
    private readonly postsService: PostsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly templatesService: TemplatesService,
  ) {}

  /**
   * Extract a label from tweet text (first ~50 characters, truncated at word boundary)
   */
  extractLabelFromTweet(tweetText: string, maxLength: number = 50): string {
    return extractPostGenerationLabel(tweetText, maxLength);
  }

  /** Starts an account or thread run through the branded seam; the placeholders return at once. */
  async startAccountContentGeneration(
    dto: GenerateAccountPostDto,
    identity: GenerationMetadata,
  ): Promise<PostDocument[]> {
    return this.postAccountGenerationService.start(dto, identity);
  }

  /** Retries one failed placeholder under a new request key. */
  async retryAccountContentGeneration(
    postId: string,
    requestKey: string,
    identity: GenerationMetadata,
  ): Promise<PostDocument> {
    return this.postAccountGenerationService.retry(
      postId,
      requestKey,
      identity,
    );
  }

  /** Expand a post into a Twitter/X thread, updating child posts as generation completes. */
  async expandThreadAsync(
    originalPost: PostDocument,
    childPosts: PostDocument[],
    dto: ExpandToThreadDto,
    identity: GenerationMetadata,
    byokApiKeyOverride?: string,
  ): Promise<void> {
    return this.postThreadGenerationService.expandThread(
      originalPost,
      childPosts,
      dto,
      identity,
      byokApiKeyOverride,
    );
  }

  /** Proposes thread replies for review; nothing is saved. */
  async draftThread(
    originalPost: PostDocument,
    dto: ExpandToThreadDto,
    identity: GenerationMetadata,
    byokApiKeyOverride?: string,
  ): Promise<string[]> {
    return this.postThreadGenerationService.draftThread(
      originalPost,
      dto,
      identity,
      byokApiKeyOverride,
    );
  }

  /** Drafts a channel post from a topic; the caller persists the result. */
  async generateDraftText(
    dto: PostDraftGenerationInput,
    identity: GenerationMetadata,
    resolveApiKey?: TextDispatchKeyResolver,
    options?: PostDraftGenerationOptions,
  ): Promise<PostDraftGenerationResult> {
    return this.postDraftGenerationService.generateDraftText(
      dto,
      identity,
      resolveApiKey,
      options,
    );
  }

  /**
   * Rewrites the post description. A draft (`dto.isDraft`) is returned for
   * review without saving; otherwise the rewrite is saved on the post.
   */
  async enhancePost(
    post: PostDocument,
    dto: EnhancePostDto,
    identity: Pick<AuthenticatedUser, 'organizationId'>,
    byokApiKeyOverride?: string,
  ): Promise<PostDocument> {
    const description = await this.enhanceDescription(
      post,
      dto,
      identity,
      byokApiKeyOverride,
    );
    if (dto.isDraft) {
      return { ...post, description };
    }
    return this.postsService.patch(String(post.id), { description });
  }

  async enhanceDescription(
    post: Pick<PostDocument, 'description' | 'platform'>,
    dto: EnhancePostDto,
    identity: Pick<AuthenticatedUser, 'organizationId'>,
    byokApiKeyOverride?: string,
  ): Promise<string> {
    const currentDescription = post.description || '';
    const platform = post.platform || 'social media';

    const platformSystemPromptMap: Record<string, string> = {
      instagram: SystemPromptKey.INSTAGRAM,
      linkedin: SystemPromptKey.LINKEDIN,
      tiktok: SystemPromptKey.TIKTOK,
      twitter: SystemPromptKey.TWITTER,
      youtube: SystemPromptKey.YOUTUBE,
    };

    const systemPromptKey =
      platformSystemPromptMap[platform.toLowerCase()] ||
      SystemPromptKey.DEFAULT;

    const prompt = await this.templatesService.getRenderedPrompt(
      PromptTemplateKey.POST_ENHANCEMENT,
      {
        currentDescription,
        platform,
        tone: dto.tone || 'professional',
        userRequest: dto.prompt,
      },
      identity.organizationId,
    );

    // Use PromptBuilderService to build prompt with templates and brand context
    const { input } = await this.promptBuilderService.buildPrompt(
      DEFAULT_MINI_TEXT_MODEL,
      {
        maxTokens: TEXT_GENERATION_LIMITS.postEnhancement,
        modelCategory: ModelCategory.TEXT,
        prompt,
        systemPromptTemplate: systemPromptKey,
        temperature: 0.8,
        useTemplate: false,
      },
      identity.organizationId,
    );

    return this.replicateService.generateTextCompletionSync(
      DEFAULT_MINI_TEXT_MODEL,
      input,
      byokApiKeyOverride,
    );
  }

  /** Generate hook variations for a topic/platform. Throws on AI failure; caller maps the error onto the HTTP boundary. */
  async generateHookVariations(
    dto: GenerateHooksDto,
    identity: Pick<
      AuthenticatedUser,
      'apiKeyId' | 'brandId' | 'id' | 'isApiKey' | 'organizationId' | 'userId'
    >,
    byokApiKeyOverride?: string,
  ): Promise<{
    hooks: string[];
    metadata: {
      count: number;
      generatedAt: string;
      platform: string;
      topic: string;
    };
  }> {
    // #5219/#5292: generation always has an explicit brand, resolved through
    // the single API-key/MCP/session resolver: explicit dto.brandId, else
    // (API-key caller) the key's validated defaultBrandId, else
    // (every other caller) identity.brandId — re-validated, since it can be
    // briefly stale — else the acting member's currentBrandId. Never an
    // org-wide guess.
    const resolvedBrandId = await resolveGenerationBrandIdForCaller({
      explicitBrandId: dto.brandId,
      noApiKeyDefaultBrandMessage:
        'brandId is required to generate hook variations. Configure a default brand for this API key, or pass brandId explicitly.',
      noBrandMessage: 'brandId is required to generate hook variations.',
      services: {
        apiKeysService: this.apiKeysService,
        brandsService: this.brandsService,
        membersService: this.membersService,
      },
      user: identity,
    });
    const brand = await this.brandsService.findOne({
      id: resolvedBrandId,
      organizationId: identity.organizationId,
    });
    if (!brand) {
      throw new BadRequestException(
        'brandId is required to generate hook variations.',
      );
    }

    const count = dto.count || 5;

    const platformToneMap: Record<string, string> = {
      instagram: 'visual, emotional, curiosity-driven. Story-worthy.',
      linkedin:
        'professional, thought-provoking, insightful. Business-oriented.',
      tiktok: 'trendy, bold, pattern-interrupt style. Scroll-stopping.',
      twitter: 'punchy, concise, attention-grabbing. Max 280 chars per hook.',
    };

    const platformGuidance =
      platformToneMap[dto.platform] || platformToneMap.twitter;
    const toneInstruction = dto.tone ? `Tone: ${dto.tone}.` : '';

    const userPrompt = `Generate ${count} different hook variations for this topic: "${dto.topic}"

Platform: ${dto.platform} (${platformGuidance})
${toneInstruction}

Requirements:
- Each hook must be unique in approach (question, statistic, bold claim, story, contrarian take)
- Optimized for ${dto.platform} engagement patterns
- No hashtags in hooks
- Return as JSON array: ["hook1", "hook2", ...]`;

    // Route through the prompt builder so hooks inherit the resolved brand's
    // voice/identity (#5219) and a typed Replicate input, matching the other
    // generation flows (issue #861). Replaces the prior raw-string call that
    // needed a type suppression because generateTextCompletionSync expects
    // an input object.
    const brandPromptBranding = buildPromptBrandingFromBrand(brand);
    const { input } = await this.promptBuilderService.buildPrompt(
      DEFAULT_MINI_TEXT_MODEL,
      {
        brand: {
          description: brand.description ?? undefined,
          label: brand.label ?? 'Brand',
          primaryColor: brand.primaryColor ?? undefined,
          secondaryColor: brand.secondaryColor ?? undefined,
          text: brand.text ?? undefined,
        },
        branding: brandPromptBranding,
        brandingMode: 'brand',
        isBrandingEnabled: true,
        maxTokens: TEXT_GENERATION_LIMITS.hookGeneration,
        modelCategory: ModelCategory.TEXT,
        prompt: userPrompt,
        systemPromptTemplate: SystemPromptKey.HOOK_GENERATOR,
        temperature: 0.8,
        useTemplate: false,
      },
      identity.organizationId,
    );

    const result = await this.replicateService.generateTextCompletionSync(
      DEFAULT_MINI_TEXT_MODEL,
      input,
      byokApiKeyOverride,
    );

    let hooks: string[] = [];
    try {
      // Try to parse JSON from the response
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        hooks = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: split by newlines and clean up
      hooks = result
        .split('\n')
        .map((line: string) =>
          line
            .replace(/^\d+[.)]\s*/, '')
            .replace(/^["']|["']$/g, '')
            .trim(),
        )
        .filter((line: string) => line.length > 10)
        .slice(0, count);
    }

    const returnedHooks = hooks.slice(0, count);

    return {
      hooks: returnedHooks,
      metadata: {
        count: returnedHooks.length,
        generatedAt: new Date().toISOString(),
        platform: dto.platform,
        topic: dto.topic,
      },
    };
  }
}
