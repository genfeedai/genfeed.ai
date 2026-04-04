import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

export type DelayMode = 'fixed' | 'until' | 'optimal';

export type DelayUnit =
  | 'milliseconds'
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'days';

export interface DelayConfig {
  /** Delay mode: fixed duration, until specific time, or optimal posting time */
  mode: DelayMode;
  /** Duration value (used with 'fixed' mode) */
  duration?: number;
  /** Duration unit (used with 'fixed' mode) */
  unit?: DelayUnit;
  /** ISO 8601 timestamp to wait until (used with 'until' mode) */
  untilTime?: string;
  /** Platform for optimal posting time lookup (used with 'optimal' mode) */
  platform?: string;
  /** Timezone for optimal time calculation */
  timezone?: string;
}

export interface DelayState {
  /** When the delay was initiated */
  startedAt: string;
  /** When the delay should resume */
  resumeAt: string;
  /** Original delay config for auditability */
  config: DelayConfig;
  /** Whether this delay has been completed */
  completed: boolean;
}

export interface DelayResult {
  /** The computed delay in milliseconds */
  delayMs: number;
  /** ISO timestamp when execution should resume */
  resumeAt: string;
  /** The serialized state for persistence */
  state: DelayState;
  /** Pass-through data from input */
  data: unknown;
}

/**
 * Resolver interface for optimal posting time lookups.
 * Injected at runtime by the NestJS service layer.
 */
export interface OptimalTimeResolver {
  getOptimalPostingTime(
    organizationId: string,
    platform: string,
    timezone?: string,
  ): Promise<Date>;
}

// =============================================================================
// UNIT CONVERSION
// =============================================================================

const UNIT_TO_MS: Record<DelayUnit, number> = {
  days: 86_400_000,
  hours: 3_600_000,
  milliseconds: 1,
  minutes: 60_000,
  seconds: 1_000,
};

export function durationToMs(duration: number, unit: DelayUnit): number {
  const multiplier = UNIT_TO_MS[unit];
  if (!multiplier) {
    throw new Error(`Unknown delay unit: ${unit}`);
  }
  return Math.max(0, Math.round(duration * multiplier));
}

// =============================================================================
// EXECUTOR
// =============================================================================

export class DelayExecutor extends BaseExecutor {
  readonly nodeType = 'delay';

  private optimalTimeResolver?: OptimalTimeResolver;

  setOptimalTimeResolver(resolver: OptimalTimeResolver): void {
    this.optimalTimeResolver = resolver;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;
    const config = this.resolveConfig(node);
    const now = new Date();
    let resumeAt: Date;

    switch (config.mode) {
      case 'fixed': {
        const duration = config.duration ?? 0;
        const unit = config.unit ?? 'minutes';
        const ms = durationToMs(duration, unit);
        resumeAt = new Date(now.getTime() + ms);
        break;
      }

      case 'until': {
        if (!config.untilTime) {
          throw new Error('Delay mode "until" requires untilTime config');
        }
        resumeAt = new Date(config.untilTime);
        if (Number.isNaN(resumeAt.getTime())) {
          throw new Error(`Invalid untilTime: ${config.untilTime}`);
        }
        // If the time is in the past, resume immediately
        if (resumeAt.getTime() <= now.getTime()) {
          resumeAt = now;
        }
        break;
      }

      case 'optimal': {
        if (!this.optimalTimeResolver) {
          throw new Error(
            'Optimal time resolver not configured. Register an OptimalTimeResolver.',
          );
        }
        const platform = config.platform ?? 'instagram';
        resumeAt = await this.optimalTimeResolver.getOptimalPostingTime(
          context.organizationId,
          platform,
          config.timezone,
        );
        // If optimal time is in the past, push to next day
        if (resumeAt.getTime() <= now.getTime()) {
          resumeAt = new Date(resumeAt.getTime() + 86_400_000);
        }
        break;
      }

      default:
        throw new Error(`Unknown delay mode: ${config.mode}`);
    }

    const delayMs = Math.max(0, resumeAt.getTime() - now.getTime());

    const state: DelayState = {
      completed: false,
      config,
      resumeAt: resumeAt.toISOString(),
      startedAt: now.toISOString(),
    };

    // Pass through the first input value
    const passthrough = inputs.values().next().value ?? null;

    const result: DelayResult = {
      data: passthrough,
      delayMs,
      resumeAt: resumeAt.toISOString(),
      state,
    };

    return {
      data: result,
      metadata: {
        delayMs,
        mode: config.mode,
        requiresDelayedJob: delayMs > 0,
        resumeAt: resumeAt.toISOString(),
      },
    };
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = node.config as Partial<DelayConfig>;

    if (!config.mode) {
      errors.push('Delay mode is required');
    } else if (!['fixed', 'until', 'optimal'].includes(config.mode)) {
      errors.push(`Invalid delay mode: ${config.mode}`);
    }

    if (config.mode === 'fixed') {
      if (config.duration === undefined || config.duration === null) {
        errors.push('Duration is required for fixed delay mode');
      } else if (typeof config.duration !== 'number' || config.duration < 0) {
        errors.push('Duration must be a non-negative number');
      }
    }

    if (config.mode === 'until' && !config.untilTime) {
      errors.push('untilTime is required for "until" delay mode');
    }

    if (config.mode === 'optimal' && !config.platform) {
      errors.push('platform is required for "optimal" delay mode');
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }

  private resolveConfig(node: ExecutableNode): DelayConfig {
    return {
      duration: node.config.duration as number | undefined,
      mode: (node.config.mode as DelayMode) ?? 'fixed',
      platform: node.config.platform as string | undefined,
      timezone: node.config.timezone as string | undefined,
      unit: (node.config.unit as DelayUnit) ?? 'minutes',
      untilTime: node.config.untilTime as string | undefined,
    };
  }
}

export function createDelayExecutor(): DelayExecutor {
  return new DelayExecutor();
}
