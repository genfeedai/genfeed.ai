import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';
import {
  buildHashtag,
  normalizeHashtag,
  type TrendInspirationPlatform,
  toNonEmptyString,
  uniqHashtags,
  VALID_PLATFORMS,
} from './trend-inspiration-shared';

export type { TrendInspirationPlatform };

export type TrendContentPreference = 'video' | 'image' | 'any';
export type TrendContentType = 'video' | 'image' | 'carousel' | 'thread';

export interface TrendHashtagInspirationSource {
  hashtag: string;
  relatedHashtags: string[];
  postCount: number | null;
  platform: TrendInspirationPlatform;
}

export interface TrendHashtagInspirationOutput {
  prompt: string;
  hashtags: string[];
  contentType: TrendContentType;
  recommendedPlatform: TrendInspirationPlatform;
  sourceHashtag: string;
  hashtagPostCount: number | null;
}

export type TrendHashtagInspirationResolver = (params: {
  organizationId: string;
  platform: TrendInspirationPlatform;
  hashtag: string | null;
  auto: boolean;
}) => Promise<TrendHashtagInspirationSource | null>;

const VALID_CONTENT_PREFERENCES = new Set<TrendContentPreference>([
  'video',
  'image',
  'any',
]);

function selectContentType(
  preference: TrendContentPreference,
  platform: TrendInspirationPlatform,
): TrendContentType {
  if (preference === 'image') {
    return platform === 'instagram' ? 'carousel' : 'image';
  }

  if (preference === 'any') {
    return platform === 'twitter' || platform === 'reddit' ? 'thread' : 'video';
  }

  return 'video';
}

function buildPrompt(input: {
  contentType: TrendContentType;
  hashtag: string;
  platform: TrendInspirationPlatform;
}): string {
  const topic = input.hashtag.replace(/^#/, '');

  switch (input.contentType) {
    case 'thread':
      return `Create a ${input.platform} thread that explains why ${input.hashtag} is gaining traction, opens with a concrete observation, and ends with a practical takeaway.`;
    case 'carousel':
      return `Create a carousel concept for ${input.hashtag}: lead with the trend tension, show three visual proof points, and close with a save-worthy takeaway.`;
    case 'image':
      return `Create an image concept inspired by ${input.hashtag}, centered on ${topic}, with a bold visual hook and a caption that connects the trend to the audience.`;
    case 'video':
      return `Create a short-form video concept for ${input.hashtag}: open with the trend payoff, show the setup in the first three seconds, and land on a repeatable creator insight.`;
  }
}

export class TrendHashtagInspirationExecutor extends BaseExecutor {
  readonly nodeType = 'trendHashtagInspiration';
  private resolver: TrendHashtagInspirationResolver | null = null;

  setResolver(resolver: TrendHashtagInspirationResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    if (
      platform !== undefined &&
      !VALID_PLATFORMS.has(platform as TrendInspirationPlatform)
    ) {
      errors.push(
        'Invalid platform. Must be one of: tiktok, instagram, twitter, youtube, reddit',
      );
    }

    const contentPreference = node.config.contentPreference;
    if (
      contentPreference !== undefined &&
      !VALID_CONTENT_PREFERENCES.has(
        contentPreference as TrendContentPreference,
      )
    ) {
      errors.push('Invalid contentPreference. Must be: video, image, or any');
    }

    const hashtag = node.config.hashtag;
    if (
      hashtag !== undefined &&
      hashtag !== null &&
      toNonEmptyString(hashtag) === null
    ) {
      errors.push('hashtag must be a non-empty string when provided');
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 1;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { context, inputs, node } = input;
    const platform = this.getOptionalConfig<TrendInspirationPlatform>(
      node.config,
      'platform',
      'tiktok',
    );
    const contentPreference = this.getOptionalConfig<TrendContentPreference>(
      node.config,
      'contentPreference',
      'video',
    );
    const auto = this.getOptionalConfig<boolean>(node.config, 'auto', true);
    const requestedHashtag =
      toNonEmptyString(inputs.get('hashtag')) ??
      toNonEmptyString(node.config.hashtag);

    const resolverResult = await this.resolver?.({
      auto,
      hashtag: requestedHashtag ? normalizeHashtag(requestedHashtag) : null,
      organizationId: context.organizationId,
      platform,
    });

    const source =
      resolverResult ??
      ({
        hashtag: requestedHashtag
          ? normalizeHashtag(requestedHashtag)
          : `${platform}Trend`,
        platform,
        postCount: null,
        relatedHashtags: [],
      } satisfies TrendHashtagInspirationSource);

    const sourceHashtag = buildHashtag(source.hashtag);
    const contentType = selectContentType(contentPreference, source.platform);
    const hashtags = uniqHashtags([
      source.hashtag,
      ...source.relatedHashtags,
      source.platform,
      contentType,
      'creator',
    ]).slice(0, 6);

    const data: TrendHashtagInspirationOutput = {
      contentType,
      hashtagPostCount: source.postCount,
      hashtags,
      prompt: buildPrompt({
        contentType,
        hashtag: sourceHashtag,
        platform: source.platform,
      }),
      recommendedPlatform: source.platform,
      sourceHashtag,
    };

    return {
      data,
      metadata: {
        auto,
        contentPreference,
        resolvedFromSource: Boolean(resolverResult),
      },
    };
  }
}

export function createTrendHashtagInspirationExecutor(
  resolver?: TrendHashtagInspirationResolver,
): TrendHashtagInspirationExecutor {
  const executor = new TrendHashtagInspirationExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}
