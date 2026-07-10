import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import {
  type TrendInspirationPlatform,
  toNonEmptyString,
  uniqOptionalHashtags,
  VALID_PLATFORMS,
} from '@workflow-engine/executors/saas/trend-inspiration-shared';
import type { ExecutableNode } from '@workflow-engine/types';

export type TrendInspirationStyle =
  | 'match_closely'
  | 'inspired_by'
  | 'remix_concept';

export type TrendContentStyle =
  | 'cinematic'
  | 'vlog'
  | 'tutorial'
  | 'comedy'
  | 'aesthetic'
  | 'educational'
  | 'storytelling'
  | 'trend_dance'
  | 'product'
  | 'other';

export type TrendAspectRatio = '16:9' | '9:16' | '1:1';

export interface TrendVideoInspirationSource {
  trendId: string;
  title: string | null;
  description: string | null;
  hook: string | null;
  hashtags: string[];
  soundId: string | null;
  duration: number | null;
  videoUrl: string | null;
  platform: TrendInspirationPlatform;
}

export interface TrendVideoInspirationOutput {
  prompt: string;
  hashtags: string[];
  soundId: string | null;
  duration: number | null;
  aspectRatio: TrendAspectRatio;
  style: TrendContentStyle;
  sourceTrendTitle: string | null;
  sourceTrendUrl: string | null;
}

export type TrendVideoInspirationResolver = (params: {
  organizationId: string;
  platform: TrendInspirationPlatform;
  trendId: string | null;
  minViralScore: number;
}) => Promise<TrendVideoInspirationSource | null>;

const VALID_INSPIRATION_STYLES = new Set<TrendInspirationStyle>([
  'match_closely',
  'inspired_by',
  'remix_concept',
]);

function aspectRatioForPlatform(
  platform: TrendInspirationPlatform,
): TrendAspectRatio {
  if (platform === 'youtube' || platform === 'twitter') {
    return '16:9';
  }

  return platform === 'instagram' ? '1:1' : '9:16';
}

function styleForInspiration(
  inspirationStyle: TrendInspirationStyle,
): TrendContentStyle {
  switch (inspirationStyle) {
    case 'match_closely':
      return 'trend_dance';
    case 'remix_concept':
      return 'storytelling';
    case 'inspired_by':
      return 'vlog';
  }
}

function buildPrompt(input: {
  source: TrendVideoInspirationSource | null;
  inspirationStyle: TrendInspirationStyle;
  includeOriginalHook: boolean;
  platform: TrendInspirationPlatform;
}): string {
  const title =
    input.source?.title ??
    input.source?.description ??
    `${input.platform} trend`;
  const hookClause =
    input.includeOriginalHook && input.source?.hook
      ? ` Keep the original hook pattern: "${input.source.hook}".`
      : '';

  switch (input.inspirationStyle) {
    case 'match_closely':
      return `Create a generation prompt that closely follows the structure of "${title}" while replacing the subject, setting, and brand details.${hookClause}`;
    case 'remix_concept':
      return `Create a generation prompt that remixes the core idea behind "${title}" into a fresh angle with a different setting, stronger story turn, and clear visual payoff.${hookClause}`;
    case 'inspired_by':
      return `Create a generation prompt inspired by "${title}" with a similar pacing arc, a distinct concept, and a creator-friendly visual style.${hookClause}`;
  }
}

export class TrendVideoInspirationExecutor extends BaseExecutor {
  readonly nodeType = 'trendVideoInspiration';
  private resolver: TrendVideoInspirationResolver | null = null;

  setResolver(resolver: TrendVideoInspirationResolver): void {
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

    const inspirationStyle = node.config.inspirationStyle;
    if (
      inspirationStyle !== undefined &&
      !VALID_INSPIRATION_STYLES.has(inspirationStyle as TrendInspirationStyle)
    ) {
      errors.push(
        'Invalid inspirationStyle. Must be: match_closely, inspired_by, or remix_concept',
      );
    }

    const minViralScore = node.config.minViralScore;
    if (
      minViralScore !== undefined &&
      (typeof minViralScore !== 'number' ||
        minViralScore < 0 ||
        minViralScore > 100)
    ) {
      errors.push('minViralScore must be between 0 and 100');
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
    const inspirationStyle = this.getOptionalConfig<TrendInspirationStyle>(
      node.config,
      'inspirationStyle',
      'inspired_by',
    );
    const includeOriginalHook = this.getOptionalConfig<boolean>(
      node.config,
      'includeOriginalHook',
      false,
    );
    const minViralScore = this.getOptionalConfig<number>(
      node.config,
      'minViralScore',
      70,
    );
    const trendId =
      toNonEmptyString(inputs.get('trendId')) ??
      toNonEmptyString(node.config.trendId);

    const source =
      (await this.resolver?.({
        minViralScore,
        organizationId: context.organizationId,
        platform,
        trendId,
      })) ?? null;

    const hashtags = uniqOptionalHashtags([
      ...(source?.hashtags ?? []),
      platform,
      inspirationStyle,
      'creator',
    ]).slice(0, 6);
    const style = styleForInspiration(inspirationStyle);

    const data: TrendVideoInspirationOutput = {
      aspectRatio: aspectRatioForPlatform(source?.platform ?? platform),
      duration: source?.duration ?? 15,
      hashtags,
      prompt: buildPrompt({
        includeOriginalHook,
        inspirationStyle,
        platform,
        source,
      }),
      soundId: source?.soundId ?? null,
      sourceTrendTitle: source?.title ?? null,
      sourceTrendUrl: source?.videoUrl ?? null,
      style,
    };

    return {
      data,
      metadata: {
        inspirationStyle,
        minViralScore,
        resolvedFromSource: Boolean(source),
        trendId: source?.trendId ?? trendId,
      },
    };
  }
}

export function createTrendVideoInspirationExecutor(
  resolver?: TrendVideoInspirationResolver,
): TrendVideoInspirationExecutor {
  const executor = new TrendVideoInspirationExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}
