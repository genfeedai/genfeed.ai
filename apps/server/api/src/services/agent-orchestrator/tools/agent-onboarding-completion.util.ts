import type { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { isExpertAccountType } from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

export async function completeAgentOnboarding(
  ctx: ToolExecutionContext,
  onboardingCreditGrantsService: OnboardingCreditGrantsService,
  organizationsService?: OrganizationsService,
  usersService?: UsersService,
): Promise<AgentToolResult> {
  const organization = await organizationsService?.findOne({
    id: ctx.organizationId,
    isDeleted: false,
  });
  const completionUser = await usersService?.findOne({ id: ctx.userId });
  const isExpert = isExpertAccountType(organization?.accountType);
  // First-system completion is recorded by PATCH /users/me, not as a
  // step key. The brand/positioning/corpus keys alone cannot authorize it.
  if (isExpert && completionUser?.isOnboardingCompleted !== true) {
    return {
      success: false,
      creditsUsed: 0,
      error:
        'Expert setup is incomplete. Use complete_brand_onboarding_step to hand off to the Expert steps before completing onboarding.',
    };
  }
  if (organizationsService) {
    await organizationsService.patch(ctx.organizationId, {
      onboardingCompleted: true,
    });
  }

  let dbUserId: string | null = null;
  if (usersService) {
    const dbUser = completionUser;

    if (dbUser) {
      dbUserId = String(dbUser.id);

      // Atomic claim: `isOnboardingCompleted: false` is part of the WHERE
      // clause, so the false->true transition itself is the concurrency
      // fence. A racing completion call — this tool firing twice, or the
      // journey re-check above — matches 0 rows and never double-fires the
      // funnel event or clobbers the already-persisted completion time.
      const { modifiedCount } = await usersService.patchAll(
        { id: dbUser.id, isOnboardingCompleted: false },
        {
          isOnboardingCompleted: true,
          onboardingCompletedAt: new Date(),
          onboardingStepsCompleted: isExpert
            ? (completionUser?.onboardingStepsCompleted ?? [])
            : ['brand', 'plan'],
        },
      );

      if (modifiedCount === 1) {
        onboardingCreditGrantsService.captureOnboardingCompletedBestEffort(
          dbUserId,
        );
      }
    }
  }

  // isOnboardingCompleted is persisted on the User row above (epic #735,
  // Phase C — no legacy auth provider identity write-back).

  return {
    creditsUsed: 0,
    data: {
      onboardingCompleted: true,
      organizationId: ctx.organizationId,
      userId: dbUserId ?? ctx.userId,
    },
    success: true,
  };
}
