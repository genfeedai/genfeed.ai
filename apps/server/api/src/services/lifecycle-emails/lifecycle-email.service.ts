import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import type {
  LifecycleEmailSequence,
  LifecycleEmailStep,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

import { LifecycleEmailQueueService } from './lifecycle-email-queue.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECKOUT_RECOVERY_DELAY_MS = 2 * 60 * 60 * 1000;
const WELCOME_TRIGGER_PREFIX = 'signup';
const CHECKOUT_TRIGGER_PREFIX = 'checkout';
const SUBSCRIPTION_TRIGGER_PREFIX = 'subscription';

const DELIVERY_STATUS = {
  CANCELED: 'canceled',
  FAILED: 'failed',
  SCHEDULED: 'scheduled',
} as const;

type UserEmailTarget = {
  id: string;
  email: string | null;
  firstName: string | null;
  isDeleted: boolean;
};

type LifecycleEmailMetadata = {
  checkoutUrl?: string;
  organizationId?: string;
  source?: string;
  subscriptionId?: string;
};

type ScheduleDeliveryInput = {
  user: UserEmailTarget;
  sequence: LifecycleEmailSequence;
  step: LifecycleEmailStep;
  triggerKey: string;
  scheduledFor: Date;
  metadata?: LifecycleEmailMetadata;
};

type CheckoutStartedInput = {
  userId: string;
  checkoutSessionId: string;
  checkoutUrl?: string | null;
  organizationId?: string;
  source?: string;
};

type ManagedCheckoutStartedInput = {
  email: string;
  checkoutSessionId: string;
  checkoutUrl?: string | null;
};

type SubscriptionLapsedInput = {
  userId: string;
  organizationId: string;
  subscriptionId: string;
};

@Injectable()
export class LifecycleEmailService {
  private readonly context = { service: LifecycleEmailService.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: LifecycleEmailQueueService,
    private readonly logger: LoggerService,
  ) {}

  async scheduleSignupLifecycle(userId: string): Promise<void> {
    await this.runSchedulingOperation('scheduleSignupLifecycle', async () => {
      const user = await this.findEmailTargetById(userId);
      if (!user?.email) {
        return;
      }

      const now = new Date();
      const triggerKey = `${WELCOME_TRIGGER_PREFIX}:${user.id}`;

      await this.scheduleDelivery({
        scheduledFor: now,
        sequence: 'welcome',
        step: 'welcome-day-0',
        triggerKey,
        user,
      });
      await this.scheduleDelivery({
        scheduledFor: new Date(now.getTime() + 2 * DAY_MS),
        sequence: 'welcome',
        step: 'welcome-day-2',
        triggerKey,
        user,
      });
      await this.scheduleDelivery({
        scheduledFor: new Date(now.getTime() + 7 * DAY_MS),
        sequence: 'welcome',
        step: 'welcome-day-7',
        triggerKey,
        user,
      });
      await this.scheduleDelivery({
        scheduledFor: new Date(now.getTime() + 3 * DAY_MS),
        sequence: 'activation-nudge',
        step: 'activation-nudge',
        triggerKey,
        user,
      });
    });
  }

  async recordCheckoutStarted(input: CheckoutStartedInput): Promise<void> {
    await this.runSchedulingOperation('recordCheckoutStarted', async () => {
      const user = await this.findEmailTargetById(input.userId);
      if (!user?.email) {
        return;
      }

      await this.scheduleDelivery({
        metadata: {
          checkoutUrl: input.checkoutUrl ?? undefined,
          organizationId: input.organizationId,
          source: input.source,
        },
        scheduledFor: new Date(Date.now() + CHECKOUT_RECOVERY_DELAY_MS),
        sequence: 'abandoned-checkout',
        step: 'checkout-recovery',
        triggerKey: this.checkoutTriggerKey(input.checkoutSessionId),
        user,
      });
    });
  }

  async recordManagedCheckoutStartedByEmail(
    input: ManagedCheckoutStartedInput,
  ): Promise<void> {
    await this.runSchedulingOperation(
      'recordManagedCheckoutStartedByEmail',
      async () => {
        const user = await this.findEmailTargetByEmail(input.email);
        if (!user?.email) {
          return;
        }

        await this.recordCheckoutStarted({
          checkoutSessionId: input.checkoutSessionId,
          checkoutUrl: input.checkoutUrl,
          source: 'managed-checkout',
          userId: user.id,
        });
      },
    );
  }

  async recordCheckoutCompleted(checkoutSessionId: string): Promise<void> {
    await this.runSchedulingOperation('recordCheckoutCompleted', async () => {
      const triggerKey = this.checkoutTriggerKey(checkoutSessionId);
      const delivery = await this.prisma.lifecycleEmailDelivery.findFirst({
        select: { userId: true },
        where: {
          sequence: 'abandoned-checkout',
          status: {
            in: [DELIVERY_STATUS.SCHEDULED, DELIVERY_STATUS.FAILED],
          },
          triggerKey,
        },
      });

      if (!delivery) {
        return;
      }

      await this.prisma.lifecycleEmailDelivery.updateMany({
        data: {
          canceledAt: new Date(),
          status: DELIVERY_STATUS.CANCELED,
        },
        where: {
          sequence: 'abandoned-checkout',
          status: {
            in: [DELIVERY_STATUS.SCHEDULED, DELIVERY_STATUS.FAILED],
          },
          triggerKey,
          userId: delivery.userId,
        },
      });
    });
  }

  async recordSubscriptionLapsed(
    input: SubscriptionLapsedInput,
  ): Promise<void> {
    await this.runSchedulingOperation('recordSubscriptionLapsed', async () => {
      const user = await this.findEmailTargetById(input.userId);
      if (!user?.email) {
        return;
      }

      await this.scheduleDelivery({
        metadata: {
          organizationId: input.organizationId,
          subscriptionId: input.subscriptionId,
        },
        scheduledFor: new Date(Date.now() + 7 * DAY_MS),
        sequence: 'win-back',
        step: 'win-back',
        triggerKey: `${SUBSCRIPTION_TRIGGER_PREFIX}:${input.subscriptionId}`,
        user,
      });
    });
  }

  private async runSchedulingOperation(
    operation: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (isSelfHostedDeployment()) {
      return;
    }

    try {
      await fn();
    } catch (error: unknown) {
      this.logger.warn('Lifecycle email scheduling skipped', {
        ...this.context,
        error: this.errorMessage(error),
        operation,
      });
    }
  }

  private async scheduleDelivery(input: ScheduleDeliveryInput): Promise<void> {
    const metadata = this.toJsonObject(input.metadata);

    try {
      await this.prisma.lifecycleEmailDelivery.create({
        data: {
          email: input.user.email ?? '',
          metadata,
          scheduledFor: input.scheduledFor,
          sequence: input.sequence,
          status: DELIVERY_STATUS.SCHEDULED,
          step: input.step,
          triggerKey: input.triggerKey,
          userId: input.user.id,
        },
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        return;
      }
      throw error;
    }

    await this.queueService.scheduleEmail(
      {
        checkoutSessionId:
          input.sequence === 'abandoned-checkout'
            ? input.triggerKey.replace(`${CHECKOUT_TRIGGER_PREFIX}:`, '')
            : undefined,
        organizationId: input.metadata?.organizationId,
        sequence: input.sequence,
        step: input.step,
        subscriptionId: input.metadata?.subscriptionId,
        triggerKey: input.triggerKey,
        userId: input.user.id,
      },
      input.scheduledFor,
    );
  }

  private async findEmailTargetById(
    userId: string,
  ): Promise<UserEmailTarget | null> {
    return await this.prisma.user.findFirst({
      select: {
        email: true,
        firstName: true,
        id: true,
        isDeleted: true,
      },
      where: {
        id: userId,
        isDeleted: false,
      },
    });
  }

  private async findEmailTargetByEmail(
    email: string,
  ): Promise<UserEmailTarget | null> {
    return await this.prisma.user.findFirst({
      select: {
        email: true,
        firstName: true,
        id: true,
        isDeleted: true,
      },
      where: {
        email,
        isDeleted: false,
      },
    });
  }

  private toJsonObject(
    value: LifecycleEmailMetadata | undefined,
  ): Record<string, string> | undefined {
    if (!value) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => {
        const [, entryValue] = entry;
        return typeof entryValue === 'string' && entryValue.length > 0;
      }),
    );
  }

  private checkoutTriggerKey(checkoutSessionId: string): string {
    return `${CHECKOUT_TRIGGER_PREFIX}:${checkoutSessionId}`;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
