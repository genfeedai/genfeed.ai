import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';

// =============================================================================
// TYPES
// =============================================================================

export interface SendEmailResult {
  /** Whether an email was dispatched. False when the upstream node skipped. */
  sent: boolean;
  /** Recipient the email was sent to (omitted when skipped). */
  to?: string;
  /** Reason the send was skipped, propagated from upstream. */
  skippedReason?: string;
}

/**
 * Function signature for the injected email sender. The NestJS service layer
 * wires this to the notifications publisher at runtime so the engine package
 * stays free of app/server dependencies.
 */
export type EmailSender = (params: {
  to: string;
  subject: string;
  html: string;
}) => Promise<void>;

// =============================================================================
// EXECUTOR
// =============================================================================

/**
 * Send Email Executor
 *
 * Generic, reusable action node that dispatches a single email. Reads
 * `to` / `subject` / `html` from wired edge inputs (falling back to node
 * config). If an upstream node marks the run as `skipped` (e.g. the trend
 * digest found nothing / lacked credits), this node no-ops without sending.
 *
 * Node Type: sendEmail
 */
export class SendEmailExecutor extends BaseExecutor {
  readonly nodeType = 'sendEmail';
  private sender: EmailSender | null = null;

  setSender(sender: EmailSender): void {
    this.sender = sender;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs } = input;

    if (!this.sender) {
      throw new Error('Email sender not configured');
    }

    const skipped =
      (inputs.get('skipped') as boolean | undefined) ??
      this.getOptionalConfig<boolean>(node.config, 'skipped', false);

    if (skipped) {
      const skippedReason =
        (inputs.get('reason') as string | undefined) ?? 'upstream-skipped';
      const result: SendEmailResult = { sent: false, skippedReason };
      return {
        data: result,
        metadata: { sent: false, skippedReason },
      };
    }

    const to =
      (inputs.get('to') as string | undefined) ??
      this.getOptionalConfig<string | undefined>(node.config, 'to', undefined);
    const subject =
      (inputs.get('subject') as string | undefined) ??
      this.getOptionalConfig<string | undefined>(
        node.config,
        'subject',
        undefined,
      );
    const html =
      (inputs.get('html') as string | undefined) ??
      this.getOptionalConfig<string | undefined>(
        node.config,
        'html',
        undefined,
      );

    if (!to) {
      throw new Error('Email recipient (to) is required (via input or config)');
    }
    if (!subject) {
      throw new Error('Email subject is required (via input or config)');
    }
    if (!html) {
      throw new Error('Email body (html) is required (via input or config)');
    }

    await this.sender({ html, subject, to });

    const result: SendEmailResult = { sent: true, to };
    return {
      data: result,
      metadata: { sent: true, to },
    };
  }

  estimateCost(): number {
    return 0;
  }
}

export function createSendEmailExecutor(
  sender?: EmailSender,
): SendEmailExecutor {
  const executor = new SendEmailExecutor();
  if (sender) {
    executor.setSender(sender);
  }
  return executor;
}
