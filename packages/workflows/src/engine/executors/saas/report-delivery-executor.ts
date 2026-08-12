import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

export type ReportDeliveryChannel = 'notification' | 'email' | 'both';

export interface ReportDeliveryResult {
  delivered: boolean;
  destination: string;
  channel: ReportDeliveryChannel;
}

export type ReportNotificationSender = (params: {
  organizationId: string;
  userId: string;
  title: string;
  body: string;
}) => Promise<void>;

export type ReportEmailSender = (params: {
  to: string;
  subject: string;
  html: string;
}) => Promise<void>;

export type ReportOwnerResolver = (params: {
  organizationId: string;
  userId: string;
}) => Promise<{ email: string | null; userId: string | null } | null>;

/**
 * Report Delivery Executor
 *
 * Delivers upstream content privately via in-app notification and/or email.
 * Does not publish to social feeds.
 *
 * Node Type: reportDelivery
 */
export class ReportDeliveryExecutor extends BaseExecutor {
  readonly nodeType = 'reportDelivery';
  private notificationSender: ReportNotificationSender | null = null;
  private emailSender: ReportEmailSender | null = null;
  private ownerResolver: ReportOwnerResolver | null = null;

  setNotificationSender(sender: ReportNotificationSender): void {
    this.notificationSender = sender;
  }

  setEmailSender(sender: ReportEmailSender): void {
    this.emailSender = sender;
  }

  setOwnerResolver(resolver: ReportOwnerResolver): void {
    this.ownerResolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];
    const channel = node.config.channel as string | undefined;
    if (channel && !['notification', 'email', 'both'].includes(channel)) {
      errors.push('channel must be notification, email, or both');
    }
    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    const channel = this.getOptionalConfig<ReportDeliveryChannel>(
      node.config,
      'channel',
      'notification',
    );

    const content =
      (inputs.get('content') as string | undefined) ??
      (inputs.get('summary') as string | undefined) ??
      (inputs.get('text') as string | undefined) ??
      this.getOptionalConfig<string>(node.config, 'content', '');

    if (!String(content).trim()) {
      throw new Error('Report content is required from an upstream node');
    }

    const subject =
      (inputs.get('subject') as string | undefined) ??
      this.getOptionalConfig<string>(
        node.config,
        'subject',
        'Workflow report',
      ) ??
      'Workflow report';

    const html =
      (inputs.get('html') as string | undefined) ??
      this.getOptionalConfig<string | undefined>(
        node.config,
        'html',
        undefined,
      ) ??
      `<pre style="white-space:pre-wrap;font-family:system-ui,sans-serif">${escapeHtml(String(content))}</pre>`;

    const destinations: string[] = [];

    if (channel === 'notification' || channel === 'both') {
      if (!this.notificationSender) {
        throw new Error('In-app notification sender not configured');
      }
      await this.notificationSender({
        body: String(content).slice(0, 4000),
        organizationId: context.organizationId,
        title: String(subject).slice(0, 200),
        userId: context.userId,
      });
      destinations.push('notification');
    }

    if (channel === 'email' || channel === 'both') {
      if (!this.emailSender) {
        throw new Error('Email sender not configured');
      }

      let to =
        (inputs.get('email') as string | undefined) ??
        this.getOptionalConfig<string>(node.config, 'email', '');

      if (!String(to).trim() && this.ownerResolver) {
        const owner = await this.ownerResolver({
          organizationId: context.organizationId,
          userId: context.userId,
        });
        to = owner?.email ?? '';
      }

      if (!String(to).trim()) {
        throw new Error(
          'Email recipient is required (config.email or org owner email)',
        );
      }

      await this.emailSender({
        html: String(html),
        subject: String(subject),
        to: String(to).trim(),
      });
      destinations.push(`email:${String(to).trim()}`);
    }

    const result: ReportDeliveryResult = {
      channel,
      delivered: true,
      destination: destinations.join(', '),
    };

    return {
      data: result,
      metadata: {
        channel,
        delivered: true,
        destination: result.destination,
      },
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createReportDeliveryExecutor(options: {
  notificationSender?: ReportNotificationSender;
  emailSender?: ReportEmailSender;
  ownerResolver?: ReportOwnerResolver;
}): ReportDeliveryExecutor {
  const executor = new ReportDeliveryExecutor();
  if (options.notificationSender) {
    executor.setNotificationSender(options.notificationSender);
  }
  if (options.emailSender) {
    executor.setEmailSender(options.emailSender);
  }
  if (options.ownerResolver) {
    executor.setOwnerResolver(options.ownerResolver);
  }
  return executor;
}
