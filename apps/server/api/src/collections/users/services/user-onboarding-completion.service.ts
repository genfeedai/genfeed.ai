import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ORGANIZATION_ONBOARDING_FINISHED_EVENT } from '@api/collections/organizations/constants/organization-events.constants';
import type { OrganizationOnboardingFinishedEvent } from '@api/collections/organizations/organization-events.types';
import type { UpdateUserDto } from '@api/collections/users/dto/update-user.dto';
import { UsersService } from '@api/collections/users/services/users.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import {
  captureOnboardingCompletedBestEffort,
  ServerFunnelCaptureService,
} from '@api/services/analytics/server-funnel-capture.service';
import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Idempotent onboarding-funnel completion behind `PATCH /users/me
 * { isOnboardingCompleted: true }`. Atomically claims the false->true
 * transition on the User row, announces the finish (the free trial starts),
 * then invalidates the access caches so `OnboardingGuard` sees the new state
 * on the next request.
 *
 * The `onboarding_completed` funnel event is captured here, server-side,
 * gated on actually winning the claim (genfeedai/genfeed.ai#5311) — it is
 * NOT captured by the client hook that calls this endpoint
 * (`useCompleteOnboarding`), which would otherwise double-emit whenever two
 * wizard tabs race, or the agent-first path completes first and this
 * endpoint later finds the user already onboarded.
 */
@Injectable()
export class UserOnboardingCompletionService {
  constructor(
    private readonly usersService: UsersService,
    private readonly userAccessCacheService: UserAccessCacheService,
    private readonly eventEmitter: EventEmitter2,
    // Depends on the leaf-level ServerFunnelCaptureService rather than
    // OnboardingCreditGrantsService: importing CreditsModule into UsersModule
    // to reach it would risk the same circular dependency UserSetupModule
    // was split out to avoid (see user-setup.module.ts).
    @Optional()
    private readonly serverFunnelCaptureService?: ServerFunnelCaptureService,
  ) {}

  /** Completes onboarding and returns the canonical database user id. */
  async complete(user: User): Promise<string> {
    const canonicalUserId = (user.userId ?? user.id) || user.id;

    const dbUser = await this.usersService.findOne({
      id: canonicalUserId,
    });

    if (!dbUser?.id) {
      throw new UnauthorizedException('User account not found');
    }

    const dbUserId = dbUser.id.toString();

    // Atomic claim: `isOnboardingCompleted: false` is part of the WHERE
    // clause, so the false->true transition itself is the concurrency fence
    // (mirrors the agent-first completion path in
    // AgentOnboardingToolHandler). A racing completion call — a second tab
    // finishing this same wizard, or the agent-first path completing first —
    // matches 0 rows and leaves the already-persisted transition untouched.
    const { modifiedCount } = await this.usersService.patchAll(
      { id: dbUser.id, isOnboardingCompleted: false },
      {
        isOnboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        onboardingStepsCompleted: ['brand', 'providers', 'summary'],
      } as Partial<UpdateUserDto>,
    );

    if (modifiedCount === 1) {
      captureOnboardingCompletedBestEffort(
        this.serverFunnelCaptureService,
        dbUserId,
      );
    }

    // Free-trial credits (granted by a CreditsModule listener, idempotent per
    // user). Emitted on every call, not only the first transition, so a
    // grant that failed once is retried by the next completion call.
    if (user.organizationId) {
      const event: OrganizationOnboardingFinishedEvent = {
        organizationId: user.organizationId,
        outcome: 'completed',
        userId: dbUserId,
      };
      await this.eventEmitter.emitAsync(
        ORGANIZATION_ONBOARDING_FINISHED_EVENT,
        event,
      );
    }

    await this.userAccessCacheService.invalidateAll(dbUserId);
    return dbUserId;
  }
}
