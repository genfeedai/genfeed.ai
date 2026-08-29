import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

export type SocialPlatform =
  | 'twitter'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'facebook'
  | 'threads'
  | 'youtube';

export type ScheduleType = 'immediate' | 'scheduled';

export interface PublishConfig {
  /**
   * Canonical action-node shape: the enabled platform ids. Authored graphs and
   * the `publish` action contract both carry a string array — there is no
   * boolean-map form.
   */
  platforms: SocialPlatform[];
  schedule: {
    type: ScheduleType;
    datetime?: string; // ISO string for scheduled posts
  };
  caption?: string;
  hashtags?: string[];
}

export interface PublishPostingTimeSlot {
  dayOfWeek: number;
  hour: number;
  avgEngagement?: number;
}

const SCHEDULE_INPUT_HANDLE = 'schedule';

export interface PublishOutput {
  postIds: string[];
  platforms: SocialPlatform[];
  scheduledFor: Date | null;
  status: 'queued' | 'scheduled' | 'published';
}

/**
 * Node output crossing the action-contract boundary. Every action serializes
 * instants as ISO strings — a `Date` instance is not a JSON document.
 */
export interface PublishNodeOutput extends Omit<PublishOutput, 'scheduledFor'> {
  scheduledFor: string | null;
}

export type PublishResolver = (params: {
  brandId: string;
  organizationId: string;
  userId: string;
  /** ID of the currently executing workflow — used by the resolver to detect
   * trigger loops when `triggerSeoOptimization` is true. */
  workflowId: string;
  media?: unknown;
  caption: string;
  platforms: SocialPlatform[];
  scheduledFor: Date | null;
  /**
   * Opt-in: when true, the resolver should emit a `post-published` event after a
   * successful publish so workflows rooted at a `postPublishTrigger` node can run
   * an SEO-optimization pass. Off by default to avoid trigger loops.
   */
  triggerSeoOptimization?: boolean;
  /** Target keyword forwarded to the downstream SEO-optimization workflow. */
  targetKeyword?: string | null;
}) => Promise<PublishOutput>;

function isPublishPostingTimeSlot(
  value: unknown,
): value is PublishPostingTimeSlot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const slot = value as Record<string, unknown>;
  return (
    typeof slot.dayOfWeek === 'number' &&
    Number.isFinite(slot.dayOfWeek) &&
    typeof slot.hour === 'number' &&
    Number.isFinite(slot.hour)
  );
}

function isPublishSchedule(value: unknown): value is PublishConfig['schedule'] {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const schedule = value as Record<string, unknown>;
  return schedule.type === 'immediate' || schedule.type === 'scheduled';
}

function scheduledForFromConfig(
  schedule: PublishConfig['schedule'],
): Date | null {
  return schedule.type === 'scheduled' && schedule.datetime
    ? new Date(schedule.datetime)
    : null;
}

export function nextOccurrenceFromPostingTime(
  slot: PublishPostingTimeSlot,
  now: Date = new Date(),
): Date {
  const scheduled = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      slot.hour,
      0,
      0,
      0,
    ),
  );
  let daysAhead = (slot.dayOfWeek - now.getUTCDay() + 7) % 7;
  if (daysAhead === 0 && scheduled <= now) {
    daysAhead = 7;
  }
  scheduled.setUTCDate(scheduled.getUTCDate() + daysAhead);
  return scheduled;
}

export function resolvePublishScheduledFor(
  scheduleConfig: PublishConfig['schedule'],
  scheduleInput: unknown,
  now: Date = new Date(),
): Date | null {
  if (Array.isArray(scheduleInput)) {
    const slots = scheduleInput.filter(isPublishPostingTimeSlot);
    if (slots.length === 0) {
      return scheduledForFromConfig(scheduleConfig);
    }

    const bestSlot = [...slots].sort(
      (left, right) => (right.avgEngagement ?? 0) - (left.avgEngagement ?? 0),
    )[0];
    if (!bestSlot) {
      return scheduledForFromConfig(scheduleConfig);
    }
    return nextOccurrenceFromPostingTime(bestSlot, now);
  }

  if (isPublishSchedule(scheduleInput)) {
    return scheduledForFromConfig(scheduleInput);
  }

  if (typeof scheduleInput === 'string' && scheduleInput.trim().length > 0) {
    const parsed = new Date(scheduleInput);
    return Number.isNaN(parsed.getTime())
      ? scheduledForFromConfig(scheduleConfig)
      : parsed;
  }

  if (scheduleInput instanceof Date && !Number.isNaN(scheduleInput.getTime())) {
    return scheduleInput;
  }

  return scheduledForFromConfig(scheduleConfig);
}

export function resolvePublishBrandId(brandInput: unknown): string {
  if (typeof brandInput === 'string' && brandInput.trim().length > 0) {
    return brandInput.trim();
  }

  if (brandInput && typeof brandInput === 'object' && 'brandId' in brandInput) {
    const brandId = (brandInput as { brandId?: unknown }).brandId;
    if (typeof brandId === 'string' && brandId.trim().length > 0) {
      return brandId.trim();
    }
  }

  throw new Error('Missing required input: brand');
}

export class PublishExecutor extends BaseExecutor {
  readonly nodeType = 'publish';
  private resolver: PublishResolver | null = null;

  setResolver(resolver: PublishResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platforms = node.config.platforms as SocialPlatform[] | undefined;
    if (!Array.isArray(platforms)) {
      errors.push('Platforms configuration is required');
    } else if (platforms.length === 0) {
      errors.push('At least one platform must be enabled');
    }

    const schedule = node.config.schedule as
      | PublishConfig['schedule']
      | undefined;
    if (schedule?.type === 'scheduled' && !schedule.datetime) {
      errors.push('Scheduled datetime is required for scheduled posts');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.resolver) {
      throw new Error('Publish resolver not configured');
    }

    const brandId = resolvePublishBrandId(
      this.getRequiredInput<unknown>(inputs, 'brand'),
    );
    const media = this.getOptionalInput<unknown | undefined>(
      inputs,
      'media',
      undefined,
    );

    const captionFromInput = this.getOptionalInput<string | undefined>(
      inputs,
      'caption',
      undefined,
    );
    const captionFromConfig = this.getOptionalConfig<string>(
      node.config,
      'caption',
      '',
    );
    const caption = (captionFromInput ?? captionFromConfig).trim();

    if (media === undefined && !caption) {
      throw new Error('Missing publish media or caption input');
    }

    const enabledPlatforms = this.getRequiredConfig<SocialPlatform[]>(
      node.config,
      'platforms',
    );

    const schedule = this.getOptionalConfig<PublishConfig['schedule']>(
      node.config,
      'schedule',
      {
        type: 'immediate',
      },
    );
    const scheduledFor = resolvePublishScheduledFor(
      schedule,
      this.getOptionalInput<unknown>(inputs, SCHEDULE_INPUT_HANDLE, undefined),
    );

    const triggerSeoOptimization = this.getOptionalConfig<boolean>(
      node.config,
      'triggerSeoOptimization',
      false,
    );
    const targetKeyword = this.getOptionalConfig<string | null>(
      node.config,
      'targetKeyword',
      null,
    );

    const result = await this.resolver({
      brandId,
      caption,
      media,
      organizationId: context.organizationId,
      platforms: enabledPlatforms,
      scheduledFor,
      targetKeyword,
      triggerSeoOptimization,
      userId: context.userId,
      workflowId: context.workflowId,
    });

    const output: PublishNodeOutput = {
      ...result,
      scheduledFor: result.scheduledFor?.toISOString() ?? null,
    };

    return {
      data: output,
      metadata: {
        platforms: enabledPlatforms,
        postCount: result.postIds.length,
        scheduledFor: scheduledFor?.toISOString() ?? null,
      },
    };
  }
}

export function createPublishExecutor(
  resolver?: PublishResolver,
): PublishExecutor {
  const executor = new PublishExecutor();
  if (resolver) {
    executor.setResolver(resolver);
  }
  return executor;
}
