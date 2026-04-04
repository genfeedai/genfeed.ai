import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type SocialPlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'linkedin'
  | 'facebook'
  | 'threads'
  | 'telegram';

export type SocialVisibility = 'public' | 'private' | 'unlisted';

export interface SocialPublishResult {
  publishedUrl: string;
  postId: string;
}

export type SocialPublisher = (params: {
  organizationId: string;
  userId: string;
  videoUrl: string;
  platform: SocialPlatform;
  title: string;
  description: string;
  tags: string[];
  visibility: SocialVisibility;
  scheduledTime: Date | null;
}) => Promise<SocialPublishResult>;

/**
 * Social Publish Executor
 *
 * Publishes video content to social media platforms.
 * Requires OAuth integrations with each platform.
 *
 * Node Type: socialPublish
 * Definition: @cloud/workflow-saas/nodes/social-publish.ts
 */
export class SocialPublishExecutor extends BaseExecutor {
  readonly nodeType = 'socialPublish';
  private publisher: SocialPublisher | null = null;

  setPublisher(publisher: SocialPublisher): void {
    this.publisher = publisher;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: SocialPlatform[] = [
      'youtube',
      'tiktok',
      'instagram',
      'twitter',
      'linkedin',
      'facebook',
      'threads',
      'telegram',
    ];
    if (!platform || !validPlatforms.includes(platform as SocialPlatform)) {
      errors.push(
        `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
      );
    }

    const visibility = node.config.visibility;
    if (
      visibility &&
      !['public', 'private', 'unlisted'].includes(visibility as string)
    ) {
      errors.push('Invalid visibility. Must be: public, private, or unlisted');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.publisher) {
      throw new Error('Social publisher not configured');
    }

    const videoUrl = this.getRequiredInput<string>(inputs, 'video');
    const platform = this.getRequiredConfig<SocialPlatform>(
      node.config,
      'platform',
    );
    const title = this.getOptionalConfig<string>(node.config, 'title', '');
    const description = this.getOptionalConfig<string>(
      node.config,
      'description',
      '',
    );
    const tags = this.getOptionalConfig<string[]>(node.config, 'tags', []);
    const visibility = this.getOptionalConfig<SocialVisibility>(
      node.config,
      'visibility',
      'public',
    );
    const scheduledTimeStr = this.getOptionalConfig<string | null>(
      node.config,
      'scheduledTime',
      null,
    );
    const scheduledTime = scheduledTimeStr ? new Date(scheduledTimeStr) : null;

    const result = await this.publisher({
      description,
      organizationId: context.organizationId,
      platform,
      scheduledTime,
      tags,
      title,
      userId: context.userId,
      videoUrl,
      visibility,
    });

    return {
      data: result.publishedUrl,
      metadata: {
        platform,
        postId: result.postId,
        scheduledTime: scheduledTime?.toISOString() ?? null,
        visibility,
      },
    };
  }
}

export function createSocialPublishExecutor(
  publisher?: SocialPublisher,
): SocialPublishExecutor {
  const executor = new SocialPublishExecutor();
  if (publisher) {
    executor.setPublisher(publisher);
  }
  return executor;
}
