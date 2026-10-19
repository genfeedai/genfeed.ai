import type { PostsService } from '@api/collections/posts/services/posts.service';
import { scheduleAgentPost } from '@api/services/agent-orchestrator/tools/agent-publish-post-actions';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type {
  AutonomousPublishPolicyService,
  ResolvedAutonomousPostPolicy,
} from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { AgentAutonomyMode, AgentPublishDecision } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

const SCHEDULED_AT = '2099-07-18T09:00:00.000Z';

function policy(
  decision: AgentPublishDecision,
  reason = 'ok',
): ResolvedAutonomousPostPolicy {
  return {
    autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
    result: { decision, reason } as ResolvedAutonomousPostPolicy['result'],
    reviewTimeoutHours: 24,
  };
}

function makeDeps() {
  const resolveForPost = vi
    .fn<AutonomousPublishPolicyService['resolveForPost']>()
    .mockResolvedValue(policy(AgentPublishDecision.PERMITTED));
  // A brand with caps: the policy is evaluated again under the lock.
  const scheduleWithinPostCaps = vi.fn(
    async (
      _scope: unknown,
      preview: ResolvedAutonomousPostPolicy,
      evaluate: () => Promise<ResolvedAutonomousPostPolicy>,
      schedule: () => Promise<unknown>,
    ) => {
      if (preview.result.decision !== AgentPublishDecision.PERMITTED)
        return { policy: preview };
      const decided = await evaluate();
      return decided.result.decision === AgentPublishDecision.PERMITTED
        ? { policy: decided, scheduled: await schedule() }
        : { policy: decided };
    },
  );
  const scheduleCanonicalPost = vi
    .fn()
    .mockResolvedValue({ creditsUsed: 1, success: true });
  const deps = {
    assertPublishingScope: vi.fn().mockResolvedValue(undefined),
    autonomousPublishPolicyService: {
      resolveForPost,
      scheduleWithinPostCaps,
    } as unknown as AutonomousPublishPolicyService,
    logger: { error: vi.fn() } as unknown as LoggerService,
    owner: 'test',
    postsService: {
      findOne: vi.fn().mockResolvedValue({
        brandId: 'brand-1',
        groupId: 'release-1',
        id: 'post-1',
      }),
    } as unknown as PostsService,
    scheduleCanonicalPost,
  };
  return {
    deps,
    resolveForPost,
    scheduleCanonicalPost,
    scheduleWithinPostCaps,
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
  it('counts the Policy post caps and schedules a proactive post under one brand lock', async () => {
    const {
      deps,
      resolveForPost,
      scheduleCanonicalPost,
      scheduleWithinPostCaps,
    } = makeDeps();

    const result = await scheduleAgentPost(
      { postId: 'post-1', scheduledAt: SCHEDULED_AT },
      context({ isProactive: true }),
      deps,
    );

    expect(result).toEqual({ creditsUsed: 1, success: true });
    expect(scheduleWithinPostCaps).toHaveBeenCalledWith(
      { brandId: 'brand-1', organizationId: 'org-1' },
      expect.anything(),
      expect.any(Function),
      expect.any(Function),
    );
    // Once before the lock, once under it.
    expect(resolveForPost).toHaveBeenCalledTimes(2);
    expect(scheduleCanonicalPost).toHaveBeenCalledTimes(1);
  });

  it('does not schedule when the lock shows the last slot is gone', async () => {
    const { deps, resolveForPost, scheduleCanonicalPost } = makeDeps();
    resolveForPost
      .mockResolvedValueOnce(policy(AgentPublishDecision.PERMITTED))
      .mockResolvedValueOnce(
        policy(AgentPublishDecision.DENIED, 'The weekly cap is reached.'),
      );

    const result = await scheduleAgentPost(
      { postId: 'post-1', scheduledAt: SCHEDULED_AT },
      context({ strategyId: 'strategy-1' }),
      deps,
    );

    expect(result).toEqual({
      creditsUsed: 0,
      data: { id: 'post-1', requiredAction: 'approval' },
      error: 'The weekly cap is reached.',
      success: false,
    });
    expect(scheduleCanonicalPost).not.toHaveBeenCalled();
  });

  it('denies before taking the lock when the first evaluation denies', async () => {
    const {
      deps,
      resolveForPost,
      scheduleCanonicalPost,
      scheduleWithinPostCaps,
    } = makeDeps();
    resolveForPost.mockResolvedValue(
      policy(AgentPublishDecision.DENIED, 'Approval is required.'),
    );

    const result = await scheduleAgentPost(
      { postId: 'post-1', scheduledAt: SCHEDULED_AT },
      context({ isProactive: true }),
      deps,
    );

    expect(result).toMatchObject({
      error: 'Approval is required.',
      success: false,
    });
    expect(scheduleWithinPostCaps).not.toHaveBeenCalled();
    expect(scheduleCanonicalPost).not.toHaveBeenCalled();
  });

  it('schedules a member-run post without evaluating or locking', async () => {
    const {
      deps,
      resolveForPost,
      scheduleCanonicalPost,
      scheduleWithinPostCaps,
    } = makeDeps();

    await scheduleAgentPost(
      { postId: 'post-1', scheduledAt: SCHEDULED_AT },
      context({}),
      deps,
    );

    expect(resolveForPost).not.toHaveBeenCalled();
    expect(scheduleWithinPostCaps).not.toHaveBeenCalled();
    expect(scheduleCanonicalPost).toHaveBeenCalledTimes(1);
  });
});
