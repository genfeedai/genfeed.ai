import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface TrendSoundInspirationSource {
  soundId: string;
  soundName: string;
  soundUrl: string | null;
  duration: number | null;
  usageCount: number | null;
  authorName: string | null;
  coverUrl: string | null;
  growthRate: number | null;
}

export interface TrendSoundInspirationOutput {
  soundId: string | null;
  soundName: string | null;
  soundUrl: string | null;
  duration: number | null;
  usageCount: number | null;
  authorName: string | null;
  coverUrl: string | null;
  growthRate: number | null;
}

export type TrendSoundInspirationResolver = (params: {
  organizationId: string;
  minUsageCount: number;
  maxDuration: number | null;
}) => Promise<TrendSoundInspirationSource | null>;

function toOptionalPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export class TrendSoundInspirationExecutor extends BaseExecutor {
  readonly nodeType = 'trendSoundInspiration';
  private resolver: TrendSoundInspirationResolver | null = null;

  setResolver(resolver: TrendSoundInspirationResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const minUsageCount = node.config.minUsageCount;
    if (
      minUsageCount !== undefined &&
      (typeof minUsageCount !== 'number' || minUsageCount < 0)
    ) {
      errors.push('minUsageCount must be a non-negative number');
    }

    const maxDuration = node.config.maxDuration;
    if (
      maxDuration !== undefined &&
      maxDuration !== null &&
      (typeof maxDuration !== 'number' || maxDuration <= 0)
    ) {
      errors.push('maxDuration must be a positive number when provided');
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 1;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { context, node } = input;
    const minUsageCount = this.getOptionalConfig<number>(
      node.config,
      'minUsageCount',
      10000,
    );
    const maxDuration = toOptionalPositiveNumber(node.config.maxDuration);

    const source = await this.resolver?.({
      maxDuration,
      minUsageCount,
      organizationId: context.organizationId,
    });

    const data: TrendSoundInspirationOutput = source
      ? {
          authorName: source.authorName,
          coverUrl: source.coverUrl,
          duration: source.duration,
          growthRate: source.growthRate,
          soundId: source.soundId,
          soundName: source.soundName,
          soundUrl: source.soundUrl,
          usageCount: source.usageCount,
        }
      : {
          authorName: null,
          coverUrl: null,
          duration: null,
          growthRate: null,
          soundId: null,
          soundName: null,
          soundUrl: null,
          usageCount: null,
        };

    return {
      data,
      metadata: {
        maxDuration,
        minUsageCount,
        resolvedFromSource: Boolean(source),
      },
    };
  }
}

export function createTrendSoundInspirationExecutor(
  resolver?: TrendSoundInspirationResolver,
): TrendSoundInspirationExecutor {
  const executor = new TrendSoundInspirationExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}
