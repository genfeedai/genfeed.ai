import type { PostsService } from '@api/collections/posts/services/posts.service';
import { scheduleAgentPost } from '@api/services/agent-orchestrator/tools/agent-publish-post-actions';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type {
  AutonomousPublishPolicyService,
  ResolvedAutonomousPostPolicy,
} from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { AgentAutonomyMode, AgentPublishDecision } from '@genfeedai/contracts';
import type { ScheduleCanonicalPostInput } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

const SCHEDULED_AT = '2099-07-18T09:00:00.000Z';

type ScheduledPost = {
  groupId: string;
  isUnderLock: boolean;
  postId: string;
  scheduledAt: string;
};

type BrandWorld = {
  evaluations: number;
  isLocked: boolean;
  lockScopes: unknown[];
  // Simulates another post taking a slot between the preview and the lock.
  onLock?: () => void;
  scheduled: ScheduledPost[];
  slotsUsed: number;
  weeklyCap: number;
};

function policy(
  decision: AgentPublishDecision,
  reason: string,
): ResolvedAutonomousPostPolicy {
  return {
    autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
    result: { decision, reason } as ResolvedAutonomousPostPolicy['result'],
    reviewTimeoutHours: 24,
  };
}

function context(overrides: Partial<ToolExecutionContext>) {
  return {
    organizationId: 'org-1',
    userId: 'user-1',
    ...overrides,
  } as ToolExecutionContext;
}

describe('scheduleAgentPost post caps (#7458)', () => {
  let world: BrandWorld;
  let approvalRule: string | undefined;

  const deps = () => ({
    assertPublishingScope: async () => undefined,
    autonomousPublishPolicyService: {
      resolveForPost: async () => {
        world.evaluations += 1;
        if (approvalRule) {
          return policy(AgentPublishDecision.DENIED, approvalRule);
        }
        return world.slotsUsed < world.weeklyCap
          ? policy(AgentPublishDecision.PERMITTED, 'ok')
          : policy(AgentPublishDecision.DENIED, 'The weekly cap is reached.');
      },
      scheduleWithinPostCaps: async (
        scope: unknown,
        preview: ResolvedAutonomousPostPolicy,
        evaluate: () => Promise<ResolvedAutonomousPostPolicy>,
        schedule: () => Promise<unknown>,
      ) => {
        world.lockScopes.push(scope);
        world.isLocked = true;
        try {
          world.onLock?.();
          const decided = await evaluate();
          if (
            preview.result.decision !== AgentPublishDecision.PERMITTED ||
            decided.result.decision !== AgentPublishDecision.PERMITTED
          ) {
            return { policy: decided };
          }
          return { policy: decided, scheduled: await schedule() };
        } finally {
          world.isLocked = false;
        }
      },
    } as unknown as AutonomousPublishPolicyService,
    logger: { error: () => undefined } as unknown as LoggerService,
    owner: 'test',
    postsService: {
      findOne: async () => ({
        brandId: 'brand-1',
        groupId: 'release-1',
        id: 'post-1',
      }),
    } as unknown as PostsService,
    scheduleCanonicalPost: async (input: ScheduleCanonicalPostInput) => {
      world.slotsUsed += 1;
      world.scheduled.push({
        groupId: input.groupId,
        isUnderLock: world.isLocked,
        postId: input.postId,
        scheduledAt: input.scheduledAt,
      });
      return { creditsUsed: 1, success: true };
    },
  });

  beforeEach(() => {
    approvalRule = undefined;
    world = {
      evaluations: 0,
      isLocked: false,
      lockScopes: [],
      scheduled: [],
      slotsUsed: 0,
      weeklyCap: 1,
    };
  });

  it('counts the Policy post caps and schedules a proactive post under one brand lock', async () => {
    const result = await scheduleAgentPost(
      { postId: 'post-1', scheduledAt: SCHEDULED_AT },
      context({ isProactive: true }),
      deps(),
    );

    expect(result).toEqual({ creditsUsed: 1, success: true });
    expect(world.lockScopes).toEqual([
      { brandId: 'brand-1', organizationId: 'org-1' },
    ]);
    // Once before the lock, once under it.
    expect(world.evaluations).toBe(2);
    expect(world.scheduled).toEqual([
      {
        groupId: 'release-1',
        isUnderLock: true,
        postId: 'post-1',
        scheduledAt: SCHEDULED_AT,
      },
    ]);
  });

  it('does not schedule when the lock shows the last slot is gone', async () => {
    world.onLock = () => {
      world.slotsUsed += 1;
    };

    const result = await scheduleAgentPost(
      { postId: 'post-1', scheduledAt: SCHEDULED_AT },
      context({ strategyId: 'strategy-1' }),
      deps(),
    );

    expect(result).toEqual({
      creditsUsed: 0,
      data: { id: 'post-1', requiredAction: 'approval' },
      error: 'The weekly cap is reached.',
      success: false,
    });
    expect(world.scheduled).toEqual([]);
  });

  it('denies before taking the lock when the first evaluation denies', async () => {
    approvalRule = 'Approval is required.';

    const result = await scheduleAgentPost(
      { postId: 'post-1', scheduledAt: SCHEDULED_AT },
      context({ isProactive: true }),
      deps(),
    );

    expect(result).toMatchObject({
      error: 'Approval is required.',
      success: false,
    });
    expect(world.lockScopes).toEqual([]);
    expect(world.scheduled).toEqual([]);
  });

  it('schedules a member-run post without evaluating or locking', async () => {
    world.weeklyCap = 0;

    const result = await scheduleAgentPost(
      { postId: 'post-1', scheduledAt: SCHEDULED_AT },
      context({}),
      deps(),
    );

    expect(result).toEqual({ creditsUsed: 1, success: true });
    expect(world.evaluations).toBe(0);
    expect(world.lockScopes).toEqual([]);
    expect(world.scheduled).toEqual([
      expect.objectContaining({ isUnderLock: false, postId: 'post-1' }),
    ]);
  });
});
