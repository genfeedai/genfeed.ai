import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Output shape of the postPublishTrigger node. When a workflow is rooted at
 * this trigger, the engine injects the `post-published` event payload directly
 * into the node's output (trigger nodes are not re-executed — their output is
 * populated from `TriggerEvent.data`). This executor's `execute()` runs only
 * when the node is invoked directly (e.g. unit tests, or manual runs); it
 * normalises inputs/config into the same stable shape so downstream `seoScore`
 * / `iterativeSeoRefine` nodes can consume it identically in both paths.
 */
export interface PostPublishTriggerOutput {
  /** IDs of the posts that were published. */
  postIds: string[];
  /** Platforms the content was published to. */
  platforms: string[];
  /** Publish status reported by the publish node. */
  status: string | null;
  /** Published body/caption — the content downstream SEO nodes score. */
  content: string | null;
  /** Title/label of the published content. */
  title: string | null;
  /** Target keyword to optimise against, if configured. */
  targetKeyword: string | null;
  /** Brand the content belongs to. */
  brandId: string | null;
}

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * Post Publish Trigger Executor
 *
 * Root trigger node that starts an SEO-optimisation workflow when content is
 * published. A `post-published` TriggerEvent is routed to workflows rooted at
 * this node via `EVENT_TYPE_TO_NODE_TYPE` in WorkflowExecutorService; the
 * publish node opts into emitting that event with `triggerSeoOptimization`.
 *
 * Node Type: postPublishTrigger
 */
export class PostPublishTriggerExecutor extends BaseExecutor {
  readonly nodeType = 'postPublishTrigger';

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs } = input;

    const upstream = inputs.values().next().value as
      | Record<string, unknown>
      | undefined;

    const read = <T>(key: string, fallback: T): T =>
      (inputs.get(key) as T | undefined) ??
      (upstream?.[key] as T | undefined) ??
      (node.config[key] as T | undefined) ??
      fallback;

    const postIdsRaw = read<unknown>('postIds', []);
    const platformsRaw = read<unknown>('platforms', []);

    const content =
      read<string | null>('content', null) ??
      read<string | null>('caption', null);

    const output: PostPublishTriggerOutput = {
      brandId: read<string | null>('brandId', null),
      content,
      platforms: Array.isArray(platformsRaw) ? (platformsRaw as string[]) : [],
      postIds: Array.isArray(postIdsRaw) ? (postIdsRaw as string[]) : [],
      status: read<string | null>('status', null),
      targetKeyword: read<string | null>('targetKeyword', null),
      title: read<string | null>('title', null),
    };

    return {
      data: output,
      metadata: {
        platformCount: output.platforms.length,
        postCount: output.postIds.length,
      },
    };
  }
}
