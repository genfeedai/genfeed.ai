import type { ExecutableNode } from '../../types';
import { deriveWorkflowActionIdempotencyKey } from '../../utils/idempotency';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

// =============================================================================
// TYPES
// =============================================================================

export type DmPlatform = 'twitter' | 'instagram';

export interface SendDmConfig {
  /** Platform to send DM on */
  platform: DmPlatform;
  /** Durable social inbox conversation id */
  conversationId?: string;
  /** Recipient user ID or username */
  recipientId?: string;
  /** DM text */
  text?: string;
  /** Optional media URL to attach */
  mediaUrl?: string;
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
  /**
   * Which of the brand's accounts on this platform sends the message. A brand
   * may hold several; omitted sends as the brand's default account.
   */
  credentialId?: string;
  conversationId?: string;
  idempotencyKey?: string;
  platform: DmPlatform;
  recipientId: string;
  text: string;
  workflowRunId: string;
  mediaUrl?: string;
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

    const recipientId = this.getConfigOrInputString(
      node,
      inputs,
      'recipientId',
    );
    const text = this.getConfigOrInputString(node, inputs, 'text');

    if (!recipientId) {
      throw new Error('Recipient ID is required (via config or input)');
    }
    if (!text) {
      throw new Error('DM text is required (via config or input)');
    }

    const mediaUrl = this.getConfigOrInputString(node, inputs, 'mediaUrl');
    const conversationId = this.getConfigOrInputString(
      node,
      inputs,
      'conversationId',
    );
    const idempotencyKey = deriveWorkflowActionIdempotencyKey({
      actionId: this.nodeType,
      executionId: context.executionId,
      nodeId: node.id,
    });

    const result = await this.sender({
      brandId: node.config.brandId as string | undefined,
      conversationId,
      credentialId: node.config.credentialId as string | undefined,
      idempotencyKey,
      mediaUrl,
      organizationId: context.organizationId,
      platform,
      recipientId,
      text,
      userId: context.userId,
      workflowRunId: context.runId,
    });

    const dmResult: SendDmResult = {
      messageId: result.messageId,
      platform,
      recipientId,
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
