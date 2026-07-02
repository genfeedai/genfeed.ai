import { randomUUID } from 'node:crypto';
import type { IAuthPublicMetadata } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { EnhancePostDto } from '@api/collections/posts/dto/enhance-post.dto';
import { ExpandToThreadDto } from '@api/collections/posts/dto/expand-thread.dto';
import { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import { GenerateHooksDto } from '@api/collections/posts/dto/generate-hooks.dto';
import {
  GenerateTweetsDto,
  TweetTone,
} from '@api/collections/posts/dto/generate-tweets.dto';
import { type PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
  ModelCategory,
  PostCategory,
  PostStatus,
  PromptTemplateKey,
  Status,
  SystemPromptKey,
} from '@genfeedai/enums';
import type {
  AccountPublishingConstraints,
  AccountPublishingContext,
  SocialGenerationFormat,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { parseTweet } from 'twitter-text';

/**
 * Identity fields threaded through the generation pipeline. Derived from
 * {@link IAuthPublicMetadata} so callers can pass the resolved request metadata
 * directly without constructing a bespoke shape.
 */
type GenerationMetadata = Pick<
  IAuthPublicMetadata,
  'brand' | 'organization' | 'user'
>;

/**
 * Thread expansion always targets X/Twitter, whose replies must respect the
 * 280 weighted-character limit. Used to validate generated thread posts so
 * over-limit replies are rejected instead of silently accepted (issue #861).
 */
const TWITTER_THREAD_CONSTRAINTS: AccountPublishingConstraints = {
  maxWeightedCharacters: 280,
  notes: ['Standard X posts use the 280 weighted-character limit.'],
  supportsDirectPublishing: true,
  supportsRichArticleCopy: false,
  supportsThreads: true,
  usesWeightedCharacters: true,
};

/**
 * Owns the AI generation engine for posts: account-content and thread-expansion
 * background pipelines, the post-enhancement and hook-variation flows, and the
 * shared prompt-building / tweet-parsing helpers. Extracted from
 * `PostsOperationsController` so the controller stays a thin HTTP boundary
 * (issue #691), mirroring the existing posts analytics service split.
 */
@Injectable()
export class PostGenerationService {
  constructor(
    private readonly accountPublishingContextService: AccountPublishingContextService,
    private readonly activitiesService: ActivitiesService,
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
    private readonly templatesService: TemplatesService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  // ==========================================================================
  // TEXT HELPERS
  // ==========================================================================

  /**
   * Strip HTML tags from a string for character counting
   */
  private stripHtmlTags(html: string): string {
    return html.replace(/<[^>]+>/g, '');
  }

  private getWeightedCharacterCount(text: string): number {
    return parseTweet(text).weightedLength;
  }

  /**
   * Validate post length without HTML tags.
   */
  private isValidPostLength(
    postHtml: string,
    maxLength = 560,
    usesWeightedCharacters = false,
  ): boolean {
    const textOnly = this.stripHtmlTags(postHtml);
    const length = usesWeightedCharacters
      ? this.getWeightedCharacterCount(textOnly)
      : textOnly.length;

    return textOnly.length > 0 && length <= maxLength;
  }

  /**
   * Parse AI-generated content into an array of tweets
   * Handles JSON arrays and fallback to marker-based splitting
   */
  parseTweetContent(
    content: string,
    maxCount: number,
    context?: Pick<AccountPublishingContext, 'constraints'>,
  ): string[] {
    let tweetLines: string[] = [];
    const maxLength =
      context?.constraints.maxWeightedCharacters ??
      context?.constraints.maxCharacters ??
      560;
    const usesWeightedCharacters =
      context?.constraints.usesWeightedCharacters ?? false;
    const cleanPost = (post: string) =>
      post.replace(/^[-*\s]*(?:tweet|post)?\s*\d+[:.)-]\s*/i, '').trim();
    const isValid = (post: string) =>
      this.isValidPostLength(post, maxLength, usesWeightedCharacters);

    try {
      // Try to parse as JSON array first
      const trimmedContent = content
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(trimmedContent);
      if (Array.isArray(parsed)) {
        tweetLines = parsed
          .map((post: unknown) => cleanPost(String(post)))
          .filter((post: string) => post.length > 0 && isValid(post))
          .slice(0, maxCount);
      }
    } catch {
      // Fallback to marker-based splitting (---)
      // Only treat '---' as the post separator when it is actually present;
      // otherwise a newline-delimited "one post per line" response would
      // collapse into a single post.
      const posts = content.includes('---')
        ? content
            .split('---')
            .map((post) => cleanPost(post))
            .filter((post) => post.length > 0 && isValid(post))
            .slice(0, maxCount)
        : [];

      if (posts.length > 0) {
        tweetLines = posts;
      } else {
        const numberedOrLinePosts = content
          .split('\n')
          .map((post) => cleanPost(post))
          .filter((post) => post.length > 0 && isValid(post))
          .slice(0, maxCount);

        if (numberedOrLinePosts.length > 0) {
          tweetLines = numberedOrLinePosts;
          return tweetLines;
        }

        // Last resort: split by double newline
        tweetLines = content
          .split(/\n\n+/)
          .map((post) => cleanPost(post))
          .filter((post) => post.length > 0 && isValid(post))
          .slice(0, maxCount);
      }
    }

    return tweetLines;
  }

  /**
   * Extract a label from tweet text (first ~50 characters, truncated at word boundary)
   */
  extractLabelFromTweet(tweetText: string, maxLength: number = 50): string {
    if (!tweetText || tweetText.trim().length === 0) {
      return '';
    }

    // Strip HTML tags for label extraction
    const textOnly = tweetText.replace(/<[^>]+>/g, ' ').trim();
    // Normalize whitespace
    const normalized = textOnly.replace(/\s+/g, ' ');

    if (normalized.length <= maxLength) {
      return normalized;
    }

    // Truncate at word boundary
    const truncated = normalized.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.7) {
      // If we found a space reasonably close to maxLength, use it
      return `${truncated.substring(0, lastSpace)}...`;
    }

    // Otherwise truncate at maxLength
    return `${truncated}...`;
  }

  private buildRemixMetadata(
    dto: Pick<
      GenerateTweetsDto,
      'sourceReferenceIds' | 'sourceUrl' | 'trendId'
    >,
  ): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {};

    if (dto.sourceReferenceIds?.length) {
      metadata.sourceReferenceIds = dto.sourceReferenceIds.map((id) =>
        String(id),
      );
    }

    if (dto.sourceUrl) {
      metadata.sourceUrl = dto.sourceUrl;
    }

    if (dto.trendId) {
      metadata.trendId = String(dto.trendId);
      metadata.trendIds = [String(dto.trendId)];
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private getAccountContextSurface(
    format: SocialGenerationFormat,
  ): AccountPublishingContext['surface'] {
    return format === 'thread' ? 'thread' : 'post';
  }

  private getSystemPromptForPlatform(
    platform: CredentialPlatform,
  ): SystemPromptKey {
    switch (platform) {
      case CredentialPlatform.INSTAGRAM:
        return SystemPromptKey.INSTAGRAM;
      case CredentialPlatform.LINKEDIN:
        return SystemPromptKey.LINKEDIN;
      case CredentialPlatform.TIKTOK:
        return SystemPromptKey.TIKTOK;
      case CredentialPlatform.YOUTUBE:
        return SystemPromptKey.YOUTUBE;
      case CredentialPlatform.TWITTER:
        return SystemPromptKey.TWITTER;
      default:
        return SystemPromptKey.BRAND_CONTEXT;
    }
  }

  private appendPublishingContextToPrompt(
    prompt: string,
    context: AccountPublishingContext,
  ): string {
    return [
      prompt,
      '',
      'Account publishing context:',
      ...context.promptHints.map((hint) => `- ${hint}`),
      ...context.constraints.notes.map((note) => `- ${note}`),
      '',
      'Do not repeat recent account posts. Keep the output tailored to this selected account.',
    ].join('\n');
  }

  // ==========================================================================
  // ACCOUNT CONTENT GENERATION
  // ==========================================================================

  private async recordGeneratedPostLineage(params: {
    dto: Pick<
      GenerateTweetsDto,
      'sourceReferenceIds' | 'sourceUrl' | 'trendId'
    >;
    draftType: 'thread' | 'tweet';
    platform: CredentialPlatform;
    postId: string;
    publicMetadata: Pick<IAuthPublicMetadata, 'brand' | 'organization'>;
    prompt: string;
  }): Promise<void> {
    const metadata = this.buildRemixMetadata(params.dto);

    if (!metadata) {
      return;
    }

    await this.trendReferenceCorpusService.recordDraftRemixLineage({
      brandId: params.publicMetadata.brand,
      draftType: params.draftType,
      generatedBy: 'posts-generation',
      metadata,
      organizationId: params.publicMetadata.organization,
      platforms: [params.platform],
      postId: params.postId,
      prompt: params.prompt,
    });
  }

  private async resolveAccountPublishingContext(
    dto: Pick<
      GenerateAccountPostDto,
      'credential' | 'format' | 'sourceReferenceIds' | 'sourceUrl' | 'trendId'
    >,
    publicMetadata: Pick<IAuthPublicMetadata, 'brand' | 'organization'>,
  ): Promise<AccountPublishingContext> {
    return this.accountPublishingContextService.resolve({
      brandId: publicMetadata.brand,
      credentialId: dto.credential,
      organizationId: publicMetadata.organization,
      sourceLineage: {
        sourceReferenceIds: dto.sourceReferenceIds,
        sourceUrl: dto.sourceUrl,
        trendId: dto.trendId,
      },
      surface: this.getAccountContextSurface(dto.format),
    });
  }

  private async createProcessingPostsForAccount(
    dto: GenerateAccountPostDto,
    publicMetadata: GenerationMetadata,
    context: AccountPublishingContext,
  ): Promise<PostDocument[]> {
    const createdPosts: PostDocument[] = [];
    const groupId = randomUUID();
    let rootPostId: string | undefined;

    for (let i = 0; i < dto.count; i++) {
      const post = await this.postsService.create({
        brand: publicMetadata.brand,
        category: PostCategory.TEXT,
        credential: dto.credential,
        description: 'Generating...',
        groupId,
        ingredients: [],
        label: '',
        order: i,
        organization: publicMetadata.organization,
        parent: dto.format === 'thread' && i > 0 ? rootPostId : undefined,
        platform: context.account.platform,
        status: PostStatus.PROCESSING,
        user: publicMetadata.user,
      });

      createdPosts.push(post);

      if (i === 0) {
        rootPostId = String(post.id);
      }
    }

    return createdPosts;
  }

  private async buildAccountGenerationPrompt(
    dto: GenerateAccountPostDto,
    context: AccountPublishingContext,
    publicMetadata: Pick<IAuthPublicMetadata, 'organization'>,
  ): Promise<string> {
    const tone = dto.tone || TweetTone.PROFESSIONAL;
    const isTwitter = context.account.platform === CredentialPlatform.TWITTER;

    if (isTwitter) {
      const template =
        dto.format === 'thread'
          ? PromptTemplateKey.THREAD_GENERATION
          : PromptTemplateKey.TWEET_GENERATION;
      const prompt = await this.templatesService.getRenderedPrompt(
        template,
        {
          count: dto.count,
          tone,
          topic: dto.topic,
        },
        publicMetadata.organization,
      );

      return this.appendPublishingContextToPrompt(prompt, context);
    }

    const limit =
      context.constraints.maxCharacters ??
      context.constraints.maxWeightedCharacters ??
      5000;

    return this.appendPublishingContextToPrompt(
      [
        `Generate ${dto.count} ${context.account.platform} ${dto.format === 'thread' ? 'thread posts' : 'social posts'} for the selected account.`,
        `Topic: ${dto.topic}`,
        `Tone: ${tone}`,
        `Maximum length per post: ${limit} characters.`,
        'Return only the generated posts, one per line. Do not include numbering unless necessary for clarity.',
      ].join('\n'),
      context,
    );
  }

  private async generateParsedAccountPosts(params: {
    context: AccountPublishingContext;
    count: number;
    input: Record<string, unknown>;
    model: string;
    organizationId: string;
  }): Promise<string[]> {
    const maxAttempts =
      params.context.account.platform === CredentialPlatform.TWITTER ? 3 : 1;
    let content = '';
    let input = params.input;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      content =
        (await this.replicateService.generateTextCompletionSync(
          params.model,
          input,
        )) ?? '';

      if (!content) {
        throw new Error('No content generated from AI service');
      }

      const lines = this.parseTweetContent(
        content,
        params.count,
        params.context,
      );

      if (lines.length >= params.count) {
        return lines;
      }

      if (attempt < maxAttempts - 1) {
        const repairPrompt = this.appendPublishingContextToPrompt(
          [
            'Regenerate the social content so every item satisfies the account constraints.',
            `Required item count: ${params.count}`,
            'Invalid previous output:',
            content,
            'Return only valid posts, one per line.',
          ].join('\n'),
          params.context,
        );
        const built = await this.promptBuilderService.buildPrompt(
          params.model,
          {
            maxTokens: TEXT_GENERATION_LIMITS.postTweetGeneration,
            modelCategory: ModelCategory.TEXT,
            prompt: repairPrompt,
            systemPromptTemplate: this.getSystemPromptForPlatform(
              params.context.account.platform,
            ),
            temperature: 0.7,
            useTemplate: false,
          },
          params.organizationId,
        );
        input = built.input;
      }
    }

    return this.parseTweetContent(content, params.count, params.context);
  }

  /**
   * Resolve the publishing context, create PROCESSING placeholder posts, and
   * kick off background content generation. Returns the created posts so the
   * caller can respond immediately while generation continues asynchronously.
   */
  async startAccountContentGeneration(
    dto: GenerateAccountPostDto,
    publicMetadata: GenerationMetadata,
  ): Promise<PostDocument[]> {
    const context = await this.resolveAccountPublishingContext(
      dto,
      publicMetadata,
    );
    const createdPosts = await this.createProcessingPostsForAccount(
      dto,
      publicMetadata,
      context,
    );

    this.generateAccountContentAsync(
      dto,
      createdPosts,
      publicMetadata,
      context,
    ).catch((error) => {
      this.logger.error(
        'Failed to generate account content asynchronously',
        error,
      );
    });

    return createdPosts;
  }

  async generateAccountContentAsync(
    dto: GenerateAccountPostDto,
    createdPosts: PostDocument[],
    publicMetadata: GenerationMetadata,
    context: AccountPublishingContext,
  ): Promise<void> {
    // Create the PROCESSING activity inside the try so a failure here cannot
    // exit the method while leaving the already-created posts stuck in
    // PROCESSING — the catch marks every post FAILED regardless (issue #861).
    let activity: Awaited<ReturnType<ActivitiesService['create']>> | undefined;

    try {
      activity = await this.activitiesService.create(
        new ActivityEntity({
          brand: publicMetadata.brand,
          key: ActivityKey.POST_PROCESSING,
          organization: publicMetadata.organization,
          source: ActivitySource.POST_GENERATION,
          user: publicMetadata.user,
          value: JSON.stringify({
            count: dto.count,
            topic: dto.topic?.substring(0, 100),
            type: `${dto.format}-generation`,
          }),
        }),
      );

      const prompt = await this.buildAccountGenerationPrompt(
        dto,
        context,
        publicMetadata,
      );
      const model = DEFAULT_MINI_TEXT_MODEL;
      const { input } = await this.promptBuilderService.buildPrompt(
        model,
        {
          maxTokens:
            dto.format === 'thread'
              ? TEXT_GENERATION_LIMITS.postThreadGeneration
              : TEXT_GENERATION_LIMITS.postTweetGeneration,
          modelCategory: ModelCategory.TEXT,
          prompt,
          systemPromptTemplate: this.getSystemPromptForPlatform(
            context.account.platform,
          ),
          temperature: 0.8,
          useTemplate: false,
        },
        publicMetadata.organization,
      );

      const generatedLines = await this.generateParsedAccountPosts({
        context,
        count: dto.count,
        input,
        model,
        organizationId: publicMetadata.organization,
      });

      for (
        let i = 0;
        i < createdPosts.length && i < generatedLines.length;
        i++
      ) {
        const post = createdPosts[i];
        const postText = generatedLines[i];
        const postId = String(post.id);

        try {
          const updatedPost = await this.postsService.patch(
            postId,
            {
              description: postText,
              label: this.extractLabelFromTweet(postText),
              status: PostStatus.DRAFT,
            },
            [
              { path: 'ingredients', select: '_id url' },
              { path: 'credential', select: '_id label handle' },
            ],
          );

          await this.websocketService.emit(WebSocketPaths.post(postId), {
            result: updatedPost,
            status: Status.COMPLETED,
          });

          await this.activitiesService.create(
            new ActivityEntity({
              brand: publicMetadata.brand,
              entityId: postId,
              entityModel: ActivityEntityModel.POST,
              key: ActivityKey.POST_GENERATED,
              organization: publicMetadata.organization,
              source: ActivitySource.POST_GENERATION,
              user: publicMetadata.user,
              value: postId,
            }),
          );

          try {
            await this.recordGeneratedPostLineage({
              draftType: dto.format === 'thread' ? 'thread' : 'tweet',
              dto,
              platform: context.account.platform,
              postId,
              prompt: dto.topic,
              publicMetadata,
            });
          } catch (lineageError) {
            this.logger.warn('Failed to record post remix lineage', {
              error:
                lineageError instanceof Error
                  ? lineageError.message
                  : String(lineageError),
              postId,
            });
          }
        } catch (error) {
          await this.handleGeneratedPostFailure(postId, error);
        }
      }

      for (let i = generatedLines.length; i < createdPosts.length; i++) {
        await this.handleGeneratedPostFailure(
          String(createdPosts[i].id ?? createdPosts[i].id),
          new Error('Insufficient valid posts generated'),
        );
      }
    } catch (error) {
      this.logger.error('Failed to generate account content asynchronously', {
        error,
        platform: context.account.platform,
      });

      if (activity) {
        try {
          await this.activitiesService.patch(activity.id.toString(), {
            key: ActivityKey.POST_FAILED,
            value: JSON.stringify({
              error: (error as Error)?.message || 'Generation failed',
            }),
          });
        } catch (activityError) {
          // Never let an activity-update failure short-circuit the cleanup
          // below — placeholder posts must still be marked FAILED, otherwise
          // they stay stuck in PROCESSING forever.
          this.logger.error(
            'Failed to mark activity as failed during account content cleanup',
            { activityError, platform: context.account.platform },
          );
        }
      }

      for (const post of createdPosts) {
        await this.handleGeneratedPostFailure(String(post.id), error);
      }
    }
  }

  private async handleGeneratedPostFailure(
    postId: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.postsService.patch(postId, {
        status: PostStatus.FAILED,
      });

      await this.websocketService.emit(WebSocketPaths.post(postId), {
        error: (error as Error)?.message || 'Generation failed',
        status: Status.FAILED,
      });
    } catch (patchError) {
      this.logger.error(
        `Failed to update post ${postId} to FAILED status`,
        patchError,
      );
    }
  }

  // ==========================================================================
  // THREAD EXPANSION
  // ==========================================================================

  /**
   * Expand an existing post into a Twitter/X thread, updating the provided
   * child posts with generated content as it completes.
   */
  async expandThreadAsync(
    originalPost: PostDocument,
    childPosts: PostDocument[],
    dto: ExpandToThreadDto,
    publicMetadata: GenerationMetadata,
  ): Promise<void> {
    // Create the PROCESSING activity inside the try so a failure here cannot
    // exit the method while leaving the child posts stuck in PROCESSING — the
    // catch marks every child FAILED regardless (issue #861).
    let activity: Awaited<ReturnType<ActivitiesService['create']>> | undefined;

    try {
      activity = await this.activitiesService.create(
        new ActivityEntity({
          brand: publicMetadata.brand,
          key: ActivityKey.POST_PROCESSING,
          organization: publicMetadata.organization,
          source: ActivitySource.POST_GENERATION,
          user: publicMetadata.user,
          value: JSON.stringify({
            count: dto.count,
            originalPostId: String(originalPost.id),
            type: 'thread-expansion',
          }),
        }),
      );

      const tone = dto.tone || TweetTone.PROFESSIONAL;
      const additionalCount = dto.count - 1;

      // Strip HTML for prompt (AI sees plain text)
      const originalContent =
        originalPost.description?.replace(/<[^>]+>/g, ' ').trim() || '';

      const prompt = await this.templatesService.getRenderedPrompt(
        PromptTemplateKey.THREAD_EXPAND,
        {
          additionalCount,
          count: dto.count,
          originalContent,
          tone,
        },
        publicMetadata.organization,
      );

      const { input } = await this.promptBuilderService.buildPrompt(
        DEFAULT_MINI_TEXT_MODEL,
        {
          maxTokens: TEXT_GENERATION_LIMITS.postThreadExpansion,
          modelCategory: ModelCategory.TEXT,
          prompt,
          systemPromptTemplate: SystemPromptKey.TWITTER,
          temperature: 0.8,
          useTemplate: false,
        },
        publicMetadata.organization,
      );

      const content = await this.replicateService.generateTextCompletionSync(
        DEFAULT_MINI_TEXT_MODEL,
        input,
      );

      if (!content) {
        throw new Error('No content generated from AI service');
      }

      // Parse content into tweet lines using helper. Thread expansion targets
      // X/Twitter, so enforce the 280 weighted-character reply limit instead of
      // the unweighted default (issue #861).
      const tweetLines = this.parseTweetContent(content, additionalCount, {
        constraints: TWITTER_THREAD_CONSTRAINTS,
      });

      // Update child posts with generated content
      for (let i = 0; i < childPosts.length && i < tweetLines.length; i++) {
        const child = childPosts[i];
        const tweetText = tweetLines[i];
        const childId = String(child.id);

        try {
          const updatedPost = await this.postsService.patch(
            childId,
            {
              description: tweetText,
              label: this.extractLabelFromTweet(tweetText),
              status: PostStatus.DRAFT,
            },
            [
              { path: 'ingredients', select: '_id url' },
              { path: 'credential', select: '_id label handle' },
            ],
          );

          await this.websocketService.emit(WebSocketPaths.post(childId), {
            result: updatedPost,
            status: Status.COMPLETED,
          });

          // Create POST_GENERATED activity for this post
          await this.activitiesService.create(
            new ActivityEntity({
              brand: publicMetadata.brand,
              entityId: childId,
              entityModel: ActivityEntityModel.POST,
              key: ActivityKey.POST_GENERATED,
              organization: publicMetadata.organization,
              source: ActivitySource.POST_GENERATION,
              user: publicMetadata.user,
              value: childId,
            }),
          );
        } catch (error) {
          this.logger.error(
            `Failed to update expanded thread post ${childId}`,
            error,
          );
          await this.handleExpandPostFailure(childId, error);
        }
      }

      // Handle insufficient tweets generated
      for (let i = tweetLines.length; i < childPosts.length; i++) {
        const childId = String(childPosts[i].id);
        await this.handleExpandPostFailure(
          childId,
          new Error('Insufficient tweets generated'),
        );
      }
    } catch (error) {
      this.logger.error('Failed to expand thread asynchronously', error);

      // Update activity to FAILED
      if (activity) {
        try {
          await this.activitiesService.patch(activity.id.toString(), {
            key: ActivityKey.POST_FAILED,
            value: JSON.stringify({
              error: (error as Error)?.message || 'Thread expansion failed',
            }),
          });
        } catch (activityError) {
          // Never let an activity-update failure short-circuit the cleanup
          // below — child posts must still be marked FAILED, otherwise they
          // stay stuck in PROCESSING forever.
          this.logger.error(
            'Failed to mark activity as failed during thread expansion cleanup',
            activityError,
          );
        }
      }

      for (const child of childPosts) {
        await this.handleExpandPostFailure(String(child.id), error);
      }
    }
  }

  /**
   * Helper to handle post failure during thread expansion
   */
  private async handleExpandPostFailure(
    postId: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.postsService.patch(postId, { status: PostStatus.FAILED });
      await this.websocketService.emit(WebSocketPaths.post(postId), {
        error: (error as Error)?.message || 'Generation failed',
        status: Status.FAILED,
      });
    } catch (patchError) {
      this.logger.error(
        `Failed to update post ${postId} to FAILED status`,
        patchError,
      );
    }
  }

  // ==========================================================================
  // POST ENHANCEMENT
  // ==========================================================================

  /**
   * Enhance a post description using AI. Returns the enhanced description; the
   * caller is responsible for persisting and serializing the result.
   */
  async enhanceDescription(
    post: PostDocument,
    dto: EnhancePostDto,
    publicMetadata: Pick<IAuthPublicMetadata, 'organization'>,
  ): Promise<string> {
    const currentDescription = post.description || '';
    const platform = post.platform || 'social media';

    // Map platform to system prompt key
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

    // Get rendered prompt from template
    const prompt = await this.templatesService.getRenderedPrompt(
      PromptTemplateKey.POST_ENHANCEMENT,
      {
        currentDescription,
        platform,
        tone: dto.tone || 'professional',
        userRequest: dto.prompt,
      },
      publicMetadata.organization,
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
      publicMetadata.organization,
    );

    return this.replicateService.generateTextCompletionSync(
      DEFAULT_MINI_TEXT_MODEL,
      input,
    );
  }

  // ==========================================================================
  // HOOK VARIATIONS
  // ==========================================================================

  /**
   * Generate hook variations for a topic/platform. Throws on AI failure; the
   * caller maps the error onto the HTTP boundary.
   */
  async generateHookVariations(
    dto: GenerateHooksDto,
    publicMetadata: Pick<IAuthPublicMetadata, 'organization'>,
  ): Promise<{
    hooks: string[];
    metadata: {
      count: number;
      generatedAt: string;
      platform: string;
      topic: string;
    };
  }> {
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

    // Route through the prompt builder so hooks inherit brand/org system-prompt
    // context and a typed Replicate input, matching the other generation flows
    // (issue #861). Replaces the prior raw-string call that needed a type
    // suppression because generateTextCompletionSync expects an input object.
    const { input } = await this.promptBuilderService.buildPrompt(
      DEFAULT_MINI_TEXT_MODEL,
      {
        maxTokens: TEXT_GENERATION_LIMITS.hookGeneration,
        modelCategory: ModelCategory.TEXT,
        prompt: userPrompt,
        systemPromptTemplate: SystemPromptKey.HOOK_GENERATOR,
        temperature: 0.8,
        useTemplate: false,
      },
      publicMetadata.organization,
    );

    const result = await this.replicateService.generateTextCompletionSync(
      DEFAULT_MINI_TEXT_MODEL,
      input,
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
