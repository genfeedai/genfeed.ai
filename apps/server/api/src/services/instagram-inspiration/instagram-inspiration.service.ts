import { createHash } from 'node:crypto';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import {
  analyzeInstagramSignals,
  buildInstagramRemixPrompt,
  deriveInstagramSeeds,
  filterInstagramPosts,
  normalizeInstagramPost,
  normalizeInstagramUsername,
  rankInstagramAccounts,
  sortInstagramPosts,
} from '@api/services/instagram-inspiration/instagram-inspiration.util';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { WorkflowStatus, WorkflowTrigger } from '@genfeedai/enums';
import type {
  InstagramInspirationBrandContext,
  InstagramInspirationDetailResult,
  InstagramInspirationListResult,
  InstagramInspirationMediaType,
  InstagramInspirationSort,
  InstagramRemixMode,
  InstagramRemixWorkflowResult,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const CACHE_TTL_SECONDS = 15 * 60;
const DEFAULT_ACCOUNT_LIMIT = 8;
const DEFAULT_DETAIL_LIMIT = 12;
const MAX_ACCOUNT_LIMIT = 15;
const MAX_DETAIL_LIMIT = 24;
const DISCOVERY_POSTS_PER_SEED = 30;

interface ListInstagramInspirationInput {
  brand: InstagramInspirationBrandContext;
  hashtags?: string[];
  limit?: number;
  mediaType?: InstagramInspirationMediaType;
  niche?: string;
  sort?: InstagramInspirationSort;
}

interface GetInstagramInspirationDetailInput {
  brand: InstagramInspirationBrandContext;
  limit?: number;
  mediaType?: InstagramInspirationMediaType;
  sort?: InstagramInspirationSort;
  username: string;
}

interface CreateInstagramRemixWorkflowInput {
  brand: InstagramInspirationBrandContext;
  mode?: InstagramRemixMode;
  notes?: string;
  shortcode: string;
  userId: string;
  username: string;
}

@Injectable()
export class InstagramInspirationService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly apifyService: ApifyService,
    private readonly cacheService: CacheService,
    private readonly workflowsService: WorkflowsService,
    private readonly loggerService: LoggerService,
  ) {}

  async listInstagramInspiration(
    input: ListInstagramInspirationInput,
  ): Promise<InstagramInspirationListResult> {
    const seedResult = deriveInstagramSeeds(input, input.brand);
    if (seedResult.seeds.length === 0) {
      throw new BadRequestException(
        'The selected brand has no niche topics or hashtags. Pass niche or hashtags to discover Instagram inspiration.',
      );
    }

    const mediaType = input.mediaType ?? 'reels';
    const sort = input.sort ?? 'top';
    const limit = this.clampLimit(
      input.limit,
      DEFAULT_ACCOUNT_LIMIT,
      MAX_ACCOUNT_LIMIT,
    );
    const cacheKey = this.buildCacheKey('list', input.brand, [
      seedResult.seeds.join(','),
      mediaType,
      sort,
      limit,
    ]);
    const cached =
      await this.cacheService.get<InstagramInspirationListResult>(cacheKey);
    if (cached) {
      return { ...cached, source: 'cache' };
    }

    const startedAt = Date.now();
    const settledPostsBySeed = await Promise.allSettled(
      seedResult.seeds.map((seed) =>
        this.apifyService.searchInstagramByHashtag(seed, {
          limit: DISCOVERY_POSTS_PER_SEED,
        }),
      ),
    );
    const postsBySeed = seedResult.seeds.map((seed, index) => {
      const outcome = settledPostsBySeed[index];
      return {
        posts: outcome?.status === 'fulfilled' ? outcome.value : [],
        seed,
      };
    });
    const accounts = rankInstagramAccounts({
      mediaType,
      ownUsername: input.brand.ownUsername,
      postsBySeed,
      seeds: seedResult.seeds,
      sort,
    }).slice(0, limit);
    const degraded =
      accounts.length === 0 ||
      postsBySeed.some((group) => group.posts.length === 0);
    const result: InstagramInspirationListResult = {
      accounts,
      degraded,
      niche: seedResult.niche,
      seeds: seedResult.seeds,
      source: 'live',
    };

    if (accounts.length > 0) {
      await this.cacheService.set(cacheKey, result, {
        tags: [
          `instagram-inspiration:${input.brand.organizationId}`,
          `instagram-inspiration:${input.brand.id}`,
        ],
        ttl: CACHE_TTL_SECONDS,
      });
    }

    this.loggerService.log(`${this.constructorName} discovery completed`, {
      accountCount: accounts.length,
      brandId: input.brand.id,
      degraded,
      durationMs: Date.now() - startedAt,
      failedSeedCount: settledPostsBySeed.filter(
        (outcome) => outcome.status === 'rejected',
      ).length,
      organizationId: input.brand.organizationId,
      seedCount: seedResult.seeds.length,
    });

    return result;
  }

  async getInstagramInspirationDetail(
    input: GetInstagramInspirationDetailInput,
  ): Promise<InstagramInspirationDetailResult> {
    const username = normalizeInstagramUsername(input.username);
    if (!username) {
      throw new BadRequestException('username is required');
    }

    const mediaType = input.mediaType ?? 'reels';
    const sort = input.sort ?? 'latest';
    const limit = this.clampLimit(
      input.limit,
      DEFAULT_DETAIL_LIMIT,
      MAX_DETAIL_LIMIT,
    );
    const cacheKey = this.buildCacheKey('detail', input.brand, [
      username,
      mediaType,
      sort,
      limit,
    ]);
    const cached =
      await this.cacheService.get<InstagramInspirationDetailResult>(cacheKey);
    if (cached) {
      return { ...cached, source: 'cache' };
    }

    const rawPosts = await this.apifyService.getInstagramUserPosts(username, {
      limit: MAX_DETAIL_LIMIT,
    });
    const posts = sortInstagramPosts(
      filterInstagramPosts(
        rawPosts
          .map((post) => normalizeInstagramPost(post))
          .filter((post) => post !== null),
        mediaType,
      ),
      sort,
    ).slice(0, limit);
    const result: InstagramInspirationDetailResult = {
      degraded: posts.length === 0,
      posts,
      signals: analyzeInstagramSignals(posts),
      source: 'live',
      username,
    };

    if (posts.length > 0) {
      await this.cacheService.set(cacheKey, result, {
        tags: [
          `instagram-inspiration:${input.brand.organizationId}`,
          `instagram-inspiration:${input.brand.id}`,
        ],
        ttl: CACHE_TTL_SECONDS,
      });
    }

    return result;
  }

  async createInstagramRemixWorkflow(
    input: CreateInstagramRemixWorkflowInput,
  ): Promise<InstagramRemixWorkflowResult> {
    const detail = await this.getInstagramInspirationDetail({
      brand: input.brand,
      limit: MAX_DETAIL_LIMIT,
      mediaType: 'all',
      sort: 'latest',
      username: input.username,
    });
    const sourcePost = detail.posts.find(
      (post) => post.shortcode === input.shortcode.trim(),
    );
    if (!sourcePost) {
      throw new BadRequestException(
        `Instagram post ${input.shortcode} was not found for @${normalizeInstagramUsername(input.username)}.`,
      );
    }

    const signals = analyzeInstagramSignals([sourcePost]);
    const mode = input.mode ?? 'inspired_by';
    const prompt = SecurityUtil.sanitizePromptInput(
      buildInstagramRemixPrompt({
        brand: input.brand,
        mode,
        notes: input.notes,
        signals,
      }),
      4000,
    );
    const workflow = await this.workflowsService.createWorkflow(
      input.userId,
      input.brand.organizationId,
      {
        brandId: input.brand.id,
        description:
          'Reinterpret a public Instagram creative pattern for the selected brand, generate an original draft, and pause for human review.',
        edges: [
          {
            id: 'edge-generate-review',
            source: 'generate-instagram-remix',
            sourceHandle: 'video',
            target: 'review-instagram-remix',
            targetHandle: 'media',
          },
        ],
        isScheduleEnabled: false,
        label: `${input.brand.label} Instagram Remix`,
        metadata: {
          brandId: input.brand.id,
          creativeSignals: signals,
          prompt,
          remixMode: mode,
          reviewStatus: 'review_required',
          source: {
            ownerUsername: sourcePost.ownerUsername,
            permalink: sourcePost.permalink,
            publishedAt: sourcePost.publishedAt,
            shortcode: sourcePost.shortcode,
          },
          transformationBoundary: 'prompt_based_reinterpretation',
        },
        nodes: [
          {
            data: {
              config: {
                aspectRatio: '9:16',
                duration: 8,
                model: 'kling-v2',
                prompt,
              },
              label: 'Generate Original Reel',
            },
            id: 'generate-instagram-remix',
            position: { x: 80, y: 120 },
            type: 'ai-generate-video',
          },
          {
            data: {
              config: {
                autoApproveIfNoResponse: false,
                notifyChannels: ['task-inbox'],
                requireApproval: true,
                timeoutHours: 24,
              },
              label: 'Review Remix',
            },
            id: 'review-instagram-remix',
            position: { x: 360, y: 120 },
            type: 'reviewGate',
          },
        ],
        status: WorkflowStatus.DRAFT,
        templateId: 'instagram-remix-review',
        trigger: WorkflowTrigger.SCHEDULED,
      },
    );

    this.loggerService.log(`${this.constructorName} workflow created`, {
      brandId: input.brand.id,
      organizationId: input.brand.organizationId,
      sourceShortcode: sourcePost.shortcode,
      workflowId: String(workflow.id),
    });

    return {
      brandId: input.brand.id,
      prompt,
      reviewRequired: true,
      source: {
        ownerUsername: sourcePost.ownerUsername,
        permalink: sourcePost.permalink,
        publishedAt: sourcePost.publishedAt,
        shortcode: sourcePost.shortcode,
      },
      status: 'draft',
      workflowId: String(workflow.id),
      workflowName: workflow.label ?? `${input.brand.label} Instagram Remix`,
    };
  }

  private buildCacheKey(
    kind: 'detail' | 'list',
    brand: InstagramInspirationBrandContext,
    parts: Array<number | string>,
  ): string {
    const fingerprint = createHash('sha256')
      .update(
        [brand.organizationId, brand.id, ...parts.map(String)].join('\u0000'),
      )
      .digest('hex');
    return this.cacheService.generateKey(
      'instagram-inspiration',
      kind,
      fingerprint,
    );
  }

  private clampLimit(
    value: number | undefined,
    fallback: number,
    maximum: number,
  ): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(maximum, Math.max(1, Math.floor(value ?? fallback)));
  }
}
