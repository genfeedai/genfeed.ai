import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// =============================================================================
// TYPES
// =============================================================================

export type DmPlatform = 'twitter' | 'instagram';

export interface SendDmConfig {
  /** Platform to send DM on */
  platform: DmPlatform;
  /** Recipient user ID or username */
  recipientId?: string;
  /** DM text */
  text?: string;
  /** Optional media URL to attach */
  mediaUrl?: string;
  /** Durable social inbox conversation id, when replying from an ingested thread */
  conversationId?: string;
}

export interface SendDmResult {
  /** Whether the DM was sent successfully */
  success: boolean;
  /** The conversation/message ID */
  messageId?: string;
  /** Platform the DM was sent on */
  platform: DmPlatform;
  /** Recipient identifier */
  recipientId: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Function signature for the injected DM sender.
 * The NestJS service layer injects the actual implementation at runtime.
 */
export type DmSender = (params: {
  organizationId: string;
  userId: string;
  /** The brand ID associated with this action. Use this instead of userId for brand-scoped operations. */
  brandId?: string;
  platform: DmPlatform;
  recipientId?: string;
  text: string;
  mediaUrl?: string;
  conversationId?: string;
  workflowRunId?: string;
  agentRunId?: string;
  workflowId?: string;
  nodeId?: string;
  sourceMessageId?: string;
}) => Promise<{ messageId: string }>;

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * Send DM Executor
 *
 * Sends a direct message on the specified platform.
 * Requires a DmSender to be injected at runtime.
 *
 * Node Type: sendDm
 */
export class SendDmExecutor extends BaseExecutor {
  readonly nodeType = 'sendDm';
  private sender: DmSender | null = null;

  setSender(sender: DmSender): void {
    this.sender = sender;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const platform = node.config.platform;
    const validPlatforms: DmPlatform[] = ['twitter', 'instagram'];
    if (!platform || !validPlatforms.includes(platform as DmPlatform)) {
      errors.push(
        `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
      );
    }

    return { errors, valid: errors.length === 0 };
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.sender) {
      throw new Error('DM sender not configured');
    }

    const platform = this.getRequiredConfig<DmPlatform>(
      node.config,
      'platform',
    );

    const recipientId =
      (node.config.recipientId as string) ??
      (inputs.get('recipientId') as string | undefined);
    const conversationId =
      (node.config.conversationId as string) ??
      (inputs.get('conversationId') as string | undefined);
    const sourceMessageId =
      (node.config.sourceMessageId as string) ??
      (inputs.get('messageId') as string | undefined);
    const text =
      (node.config.text as string) ??
      (inputs.get('text') as string | undefined);

    const recipientTargetId = recipientId ?? conversationId;
    if (!recipientTargetId) {
      throw new Error(
        'Recipient ID or social inbox conversation ID is required (via config or input)',
      );
    }
    if (!text) {
      throw new Error('DM text is required (via config or input)');
    }

    const mediaUrl =
      (node.config.mediaUrl as string) ??
      (inputs.get('mediaUrl') as string | undefined);

    const result = await this.sender({
      brandId: node.config.brandId as string | undefined,
      conversationId,
      agentRunId: node.config.agentRunId as string | undefined,
      mediaUrl,
      nodeId: node.id,
      organizationId: context.organizationId,
      platform,
      recipientId,
      sourceMessageId,
      text,
      userId: context.userId,
      workflowId: context.workflowId,
      workflowRunId: context.runId,
    });

    const dmResult: SendDmResult = {
      messageId: result.messageId,
      platform,
      recipientId: recipientTargetId,
      success: true,
    };

    return {
      data: dmResult,
      metadata: {
        messageId: result.messageId,
        platform,
        recipientId,
      },
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 1;
  }
}

export function createSendDmExecutor(): SendDmExecutor {
  return new SendDmExecutor();
}
