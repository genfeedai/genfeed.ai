import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';
import type { BrandContextOutput } from './brand-executor';

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
  platforms: Record<SocialPlatform, boolean>;
  schedule: {
    type: ScheduleType;
    datetime?: string; // ISO string for scheduled posts
  };
  caption?: string;
  hashtags?: string[];
}

export interface PublishOutput {
  postIds: string[];
  platforms: SocialPlatform[];
  scheduledFor: Date | null;
  status: 'queued' | 'scheduled' | 'published';
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

export class PublishExecutor extends BaseExecutor {
  readonly nodeType = 'publish';
  private resolver: PublishResolver | null = null;

  setResolver(resolver: PublishResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platforms = node.config.platforms as
      | Record<SocialPlatform, boolean>
      | undefined;
    if (!platforms) {
      errors.push('Platforms configuration is required');
    } else {
      const enabledPlatforms = Object.entries(platforms)
        .filter(([_, enabled]) => enabled)
        .map(([platform]) => platform);

      if (enabledPlatforms.length === 0) {
        errors.push('At least one platform must be enabled');
      }
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

    const brandContext = this.getRequiredInput<BrandContextOutput>(
      inputs,
      'brand',
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

    const platforms = this.getRequiredConfig<Record<SocialPlatform, boolean>>(
      node.config,
      'platforms',
    );
    const enabledPlatforms = Object.entries(platforms)
      .filter(([_, enabled]) => enabled)
      .map(([platform]) => platform as SocialPlatform);

    const schedule = this.getOptionalConfig<PublishConfig['schedule']>(
      node.config,
      'schedule',
      {
        type: 'immediate',
      },
    );
    const scheduledFor =
      schedule.type === 'scheduled' && schedule.datetime
        ? new Date(schedule.datetime)
        : null;

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
      brandId: brandContext.brandId,
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

    return {
      data: result,
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
