import type { UserSetupResult } from '@api/collections/users/services/user-setup.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import { SignupPrefillWorkflowService } from '@api/services/signup-prefill/signup-prefill-workflow.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as Sentry from '@sentry/nestjs';

import { BETTER_AUTH_USER_CREATED_EVENT } from '../better-auth.constants';
import type { IBetterAuthUserCreatedEvent } from '../better-auth.types';

/**
 * Provisions a newly created Better Auth user — organization, settings, brand,
 * member and credit balance — by reusing the idempotent
 * {@link UserSetupService.initializeUserResources} chain (the same one the legacy auth provider
 * `user.created` webhook drove). First-party replacement for that webhook
 * (epic #735, Phase 4).
 *
 * Driven by `BetterAuthModule`'s `onUserCreated` callback via
 * `eventEmitter.emitAsync`, so the `user.create.after` hook awaits this handler:
 * a brand-new user is fully set up before their first request, while a returning
 * (magic-link-preserved) user keeps their existing resources because every step
 * is get-or-create.
 */
@Injectable()
export class UserProvisioningListener {
  private readonly context = 'UserProvisioningListener';

  constructor(
    private readonly userSetupService: UserSetupService,
    private readonly lifecycleEmailService: LifecycleEmailService,
    private readonly signupPrefillWorkflowService: SignupPrefillWorkflowService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(BETTER_AUTH_USER_CREATED_EVENT)
  async handleUserCreated(event: IBetterAuthUserCreatedEvent): Promise<void> {
    try {
      const setupResult = await this.userSetupService.initializeUserResources(
        event.userId,
        undefined,
        { email: event.email },
      );
      this.logger.log(
        `Provisioned resources for Better Auth user ${event.userId}`,
        this.context,
      );
      await this.scheduleLifecycleEmails(event.userId);
      this.scheduleBrandPrefill(event, setupResult);
      this.notifyOperatorOfNewUser(event);
    } catch (error: unknown) {
      // Never fail sign-in on a provisioning hiccup — initializeUserResources is
      // idempotent, so a later request can complete it. Log loudly for ops.
      this.logger.error(
        `Failed to provision Better Auth user ${event.userId}`,
        {
          error: (error as Error)?.message,
          stack: (error as Error)?.stack,
        },
      );
    }
  }

  /**
   * Hand the freshly created placeholder brand to the background prefill job so
   * the brand carries a real voice, strategy and harness profile before the user
   * writes their first prompt. Best-effort by design — a queue outage must not
   * take sign-in with it, and the job is idempotent on the brand id.
   */
  private scheduleBrandPrefill(
    event: IBetterAuthUserCreatedEvent,
    setupResult: UserSetupResult,
  ): void {
    const brandId = setupResult.brand?.id;
    const organizationId = setupResult.organization?.id;

    if (!brandId || !organizationId) {
      return;
    }

    void this.signupPrefillWorkflowService
      .enqueuePrefill({
        brandId: String(brandId),
        email: event.email ?? undefined,
        organizationId: String(organizationId),
        userId: event.userId,
      })
      .catch((error: unknown) => {
        this.logger.warn(`${this.context} brand prefill scheduling skipped`, {
          error: error instanceof Error ? error.message : error,
          userId: event.userId,
        });
      });
  }

  private async scheduleLifecycleEmails(userId: string): Promise<void> {
    try {
      await this.lifecycleEmailService.scheduleSignupLifecycle(userId);
    } catch (error: unknown) {
      this.logger.warn(`${this.context} lifecycle email scheduling skipped`, {
        error: error instanceof Error ? error.message : error,
        userId,
      });
    }
  }

  /**
   * Operator Discord alert for every new signup (genfeedai/genfeed.ai#4969).
   * `handleUserCreated` only runs from Better Auth's `user.create.after` hook
   * (or the checkout handler's one-time emit for a checkout-first account),
   * so this fires exactly once per created user — no separate debounce is
   * needed. Fire-and-forget by design, matching {@link scheduleBrandPrefill}:
   * a slow or failing notification transport must never delay or fail
   * sign-in, which has already committed above.
   */
  private notifyOperatorOfNewUser(event: IBetterAuthUserCreatedEvent): void {
    void this.activityRecorder
      .dispatch({
        deduplicationKey: `message.user-created/${event.userId}`,
        messages: [
          {
            destination: null,
            message: {
              action: 'user_notification',
              payload: { email: event.email ?? undefined, id: event.userId },
              type: 'discord',
            },
          },
        ],
        organizationId: null,
        source: { id: event.userId, type: 'user' },
        topic: 'operator.alerts',
      })
      .catch((error: unknown) => {
        this.logger.error(`${this.context} operator signup alert failed`, {
          error: error instanceof Error ? error.message : error,
          userId: event.userId,
        });
        Sentry.captureException(error, {
          extra: { userId: event.userId },
        });
      });
  }
}
