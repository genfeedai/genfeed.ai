import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  LIFECYCLE_SCHEDULING_ACTION_IDS,
  LIFECYCLE_SCHEDULING_WORKFLOW_DEFINITIONS,
  LIFECYCLE_SCHEDULING_WORKFLOW_IDS,
  type LifecycleCheckoutCancellationItem,
  type LifecycleDeliveryScheduleItem,
  type LifecycleSchedulingRequest,
} from './lifecycle-email-scheduling-workflow-definition';
import { LifecycleEmailWorkflowService } from './lifecycle-email-workflow.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECKOUT_RECOVERY_DELAY_MS = 2 * 60 * 60 * 1000;
const DELIVERY_STATUS = {
  CANCELED: 'canceled',
  FAILED: 'failed',
  SCHEDULED: 'scheduled',
} as const;

type UserEmailTarget = {
  email: string | null;
  firstName: string | null;
  id: string;
  isDeleted: boolean;
};

type CheckoutStartedInput = {
  checkoutSessionId: string;
  checkoutUrl?: string | null;
  organizationId?: string;
  source?: string;
  userId: string;
};

type ManagedCheckoutStartedInput = {
  checkoutSessionId: string;
  checkoutUrl?: string | null;
  email: string;
};

type SubscriptionLapsedInput = {
  organizationId: string;
  subscriptionId: string;
  userId: string;
};

@Injectable()
export class LifecycleEmailService implements OnModuleInit {
  private readonly context = { service: LifecycleEmailService.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: LifecycleEmailWorkflowService,
    private readonly runner: SystemWorkflowRunnerService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(
      LIFECYCLE_SCHEDULING_ACTION_IDS.PLAN,
      ({ context, input }) =>
        this.planScheduling(
          input.request as LifecycleSchedulingRequest,
          context.organizationId,
        ),
    );
    this.runner.registerAction(
      LIFECYCLE_SCHEDULING_ACTION_IDS.PERSIST_DELIVERY,
      ({ context, input }) =>
        this.persistDelivery(
          input.request as LifecycleDeliveryScheduleItem,
          context.organizationId,
        ),
    );
    this.runner.registerAction(
      LIFECYCLE_SCHEDULING_ACTION_IDS.ENQUEUE_DELIVERY,
      ({ context, input }) =>
        this.enqueueDelivery(
          input.request as LifecycleDeliveryScheduleItem,
          context.organizationId,
        ),
    );
    this.runner.registerAction(
      LIFECYCLE_SCHEDULING_ACTION_IDS.CANCEL_CHECKOUT,
      ({ context, input }) =>
        this.cancelCheckout(
          input.request as LifecycleCheckoutCancellationItem,
          context.organizationId,
        ),
    );
    this.runner.registerAction(
      LIFECYCLE_SCHEDULING_ACTION_IDS.FINALIZE,
      ({ input }) => this.finalizeScheduling(input),
    );
    for (const definition of LIFECYCLE_SCHEDULING_WORKFLOW_DEFINITIONS) {
      this.runner.registerWorkflow(definition);
    }
  }

  scheduleSignupLifecycle(userId: string): Promise<void> {
    return this.runSchedulingOperation('scheduleSignupLifecycle', {
      operation: 'signup',
      userId,
    });
  }

  recordCheckoutStarted(input: CheckoutStartedInput): Promise<void> {
    return this.runSchedulingOperation('recordCheckoutStarted', {
      checkoutSessionId: input.checkoutSessionId,
      ...(input.checkoutUrl === undefined || input.checkoutUrl === null
        ? {}
        : { checkoutUrl: input.checkoutUrl }),
      operation: 'checkout-started',
      ...(input.organizationId === undefined
        ? {}
        : { organizationId: input.organizationId }),
      ...(input.source === undefined ? {} : { source: input.source }),
      userId: input.userId,
    });
  }

  recordManagedCheckoutStartedByEmail(
    input: ManagedCheckoutStartedInput,
  ): Promise<void> {
    return this.runSchedulingOperation('recordManagedCheckoutStartedByEmail', {
      checkoutSessionId: input.checkoutSessionId,
      ...(input.checkoutUrl === undefined || input.checkoutUrl === null
        ? {}
        : { checkoutUrl: input.checkoutUrl }),
      email: input.email,
      operation: 'managed-checkout-started',
    });
  }

  recordCheckoutCompleted(checkoutSessionId: string): Promise<void> {
    return this.runSchedulingOperation('recordCheckoutCompleted', {
      checkoutSessionId,
      operation: 'checkout-completed',
    });
  }

  recordSubscriptionLapsed(input: SubscriptionLapsedInput): Promise<void> {
    return this.runSchedulingOperation('recordSubscriptionLapsed', {
      ...input,
      operation: 'subscription-lapsed',
    });
  }

  private async runSchedulingOperation(
    operation: string,
    request: LifecycleSchedulingRequest,
  ): Promise<void> {
    if (isSelfHostedDeployment()) return;
    try {
      const workflowContext = await this.resolveWorkflowContext(request);
      if (!workflowContext) return;
      await this.runner.runWorkflow({
        actionType: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.SCHEDULE,
        canonicalId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.SCHEDULE,
        inputValues: { request },
        organizationId: workflowContext.organizationId,
        source: `LifecycleEmailService.${operation}`,
        userId: workflowContext.userId,
      });
    } catch (error: unknown) {
      this.logger.warn('Lifecycle email scheduling skipped', {
        ...this.context,
        error: error instanceof Error ? error.message : String(error),
        operation,
      });
    }
  }

  private async planScheduling(
    request: LifecycleSchedulingRequest,
    organizationId: string,
  ): Promise<{
    cancellationItems: LifecycleCheckoutCancellationItem[];
    deliveryItems: LifecycleDeliveryScheduleItem[];
  }> {
    if (request.operation === 'checkout-completed') {
      const triggerKey = this.checkoutTriggerKey(request.checkoutSessionId);
      const delivery = await this.prisma.lifecycleEmailDelivery.findFirst({
        select: { userId: true },
        where: {
          sequence: 'abandoned-checkout',
          status: { in: [DELIVERY_STATUS.SCHEDULED, DELIVERY_STATUS.FAILED] },
          triggerKey,
        },
      });
      return {
        cancellationItems: delivery
          ? [{ organizationId, triggerKey, userId: delivery.userId }]
          : [],
        deliveryItems: [],
      };
    }

    const user =
      request.operation === 'managed-checkout-started'
        ? await this.findEmailTargetByEmail(request.email)
        : await this.findEmailTargetById(request.userId);
    if (!user?.email) return { cancellationItems: [], deliveryItems: [] };
    const now = new Date();
    const common = { email: user.email, organizationId, userId: user.id };

    if (request.operation === 'signup') {
      const triggerKey = `signup-${user.id}`;
      return {
        cancellationItems: [],
        deliveryItems: [
          this.deliveryItem(
            common,
            'welcome',
            'welcome-day-0',
            triggerKey,
            now,
          ),
          this.deliveryItem(
            common,
            'welcome',
            'welcome-day-2',
            triggerKey,
            new Date(now.getTime() + 2 * DAY_MS),
          ),
          this.deliveryItem(
            common,
            'welcome',
            'welcome-day-7',
            triggerKey,
            new Date(now.getTime() + 7 * DAY_MS),
          ),
          this.deliveryItem(
            common,
            'activation-nudge',
            'activation-nudge',
            triggerKey,
            new Date(now.getTime() + 3 * DAY_MS),
          ),
        ],
      };
    }

    if (
      request.operation === 'checkout-started' ||
      request.operation === 'managed-checkout-started'
    ) {
      const metadata = {
        ...(request.checkoutUrl ? { checkoutUrl: request.checkoutUrl } : {}),
        organizationId,
        source:
          request.operation === 'managed-checkout-started'
            ? 'managed-checkout'
            : request.source,
      };
      return {
        cancellationItems: [],
        deliveryItems: [
          {
            ...this.deliveryItem(
              common,
              'abandoned-checkout',
              'checkout-recovery',
              this.checkoutTriggerKey(request.checkoutSessionId),
              new Date(now.getTime() + CHECKOUT_RECOVERY_DELAY_MS),
            ),
            checkoutSessionId: request.checkoutSessionId,
            metadata: this.compactMetadata(metadata),
          },
        ],
      };
    }

    return {
      cancellationItems: [],
      deliveryItems: [
        {
          ...this.deliveryItem(
            common,
            'win-back',
            'win-back',
            `subscription-${request.subscriptionId}`,
            new Date(now.getTime() + 7 * DAY_MS),
          ),
          metadata: {
            organizationId,
            subscriptionId: request.subscriptionId,
          },
        },
      ],
    };
  }

  private async persistDelivery(
    item: LifecycleDeliveryScheduleItem,
    organizationId: string,
  ): Promise<{ items: LifecycleDeliveryScheduleItem[] }> {
    this.assertOrganization(item.organizationId, organizationId);
    try {
      await this.prisma.lifecycleEmailDelivery.create({
        data: {
          email: item.email,
          metadata: item.metadata,
          scheduledFor: new Date(item.scheduledFor),
          sequence: item.sequence,
          status: DELIVERY_STATUS.SCHEDULED,
          step: item.step,
          triggerKey: item.triggerKey,
          userId: item.userId,
        },
      });
      return { items: [item] };
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) return { items: [] };
      throw error;
    }
  }

  private async enqueueDelivery(
    item: LifecycleDeliveryScheduleItem,
    organizationId: string,
  ): Promise<LifecycleDeliveryScheduleItem> {
    this.assertOrganization(item.organizationId, organizationId);
    const subscriptionId = item.metadata?.subscriptionId;
    await this.workflowService.scheduleEmail(
      {
        ...(item.checkoutSessionId === undefined
          ? {}
          : { checkoutSessionId: item.checkoutSessionId }),
        organizationId,
        sequence: item.sequence,
        step: item.step,
        ...(subscriptionId === undefined ? {} : { subscriptionId }),
        triggerKey: item.triggerKey,
        userId: item.userId,
      },
      new Date(item.scheduledFor),
    );
    return item;
  }

  private async cancelCheckout(
    item: LifecycleCheckoutCancellationItem,
    organizationId: string,
  ): Promise<LifecycleCheckoutCancellationItem> {
    this.assertOrganization(item.organizationId, organizationId);
    await this.prisma.lifecycleEmailDelivery.updateMany({
      data: { canceledAt: new Date(), status: DELIVERY_STATUS.CANCELED },
      where: {
        sequence: 'abandoned-checkout',
        status: { in: [DELIVERY_STATUS.SCHEDULED, DELIVERY_STATUS.FAILED] },
        triggerKey: item.triggerKey,
        userId: item.userId,
      },
    });
    return item;
  }

  private finalizeScheduling(input: Record<string, unknown>): {
    canceled: number;
    scheduled: number;
  } {
    return {
      canceled: this.batchCount(input.canceled),
      scheduled: this.batchCount(input.scheduled),
    };
  }

  private deliveryItem(
    target: { email: string; organizationId: string; userId: string },
    sequence: LifecycleDeliveryScheduleItem['sequence'],
    step: LifecycleDeliveryScheduleItem['step'],
    triggerKey: string,
    scheduledFor: Date,
  ): LifecycleDeliveryScheduleItem {
    return {
      ...target,
      scheduledFor: scheduledFor.toISOString(),
      sequence,
      step,
      triggerKey,
    };
  }

  private async resolveWorkflowContext(
    request: LifecycleSchedulingRequest,
  ): Promise<{ organizationId: string; userId: string } | null> {
    let userId = this.requestUserId(request);
    if (request.operation === 'managed-checkout-started') {
      userId = (await this.findEmailTargetByEmail(request.email))?.id;
    } else if (request.operation === 'checkout-completed') {
      const delivery = await this.prisma.lifecycleEmailDelivery.findFirst({
        select: { userId: true },
        where: {
          triggerKey: this.checkoutTriggerKey(request.checkoutSessionId),
        },
      });
      userId = delivery?.userId;
    }
    if (!userId) return null;
    if ('organizationId' in request && request.organizationId) {
      return { organizationId: request.organizationId, userId };
    }
    const member = await this.prisma.member.findFirst({
      select: { organizationId: true },
      where: { isActive: true, isDeleted: false, userId },
    });
    return member ? { organizationId: member.organizationId, userId } : null;
  }

  private requestUserId(
    request: LifecycleSchedulingRequest,
  ): string | undefined {
    return 'userId' in request ? request.userId : undefined;
  }

  private findEmailTargetById(userId: string): Promise<UserEmailTarget | null> {
    return this.prisma.user.findFirst({
      select: { email: true, firstName: true, id: true, isDeleted: true },
      where: { id: userId, isDeleted: false },
    });
  }

  private findEmailTargetByEmail(
    email: string,
  ): Promise<UserEmailTarget | null> {
    return this.prisma.user.findFirst({
      select: { email: true, firstName: true, id: true, isDeleted: true },
      where: { email, isDeleted: false },
    });
  }

  private checkoutTriggerKey(checkoutSessionId: string): string {
    return `checkout-${checkoutSessionId}`;
  }

  private compactMetadata(
    metadata: Record<string, string | undefined>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(metadata).filter((entry): entry is [string, string] =>
        Boolean(entry[1]),
      ),
    );
  }

  private assertOrganization(actual: string, expected: string): void {
    if (actual !== expected) {
      throw new Error('Lifecycle scheduling organization mismatch');
    }
  }

  private batchCount(value: unknown): number {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
    const count = (value as Record<string, unknown>).count;
    return typeof count === 'number' ? count : 0;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
