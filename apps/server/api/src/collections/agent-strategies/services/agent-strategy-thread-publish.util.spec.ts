import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import {
  type AutopilotThreadPublishDependencies,
  publishAutopilotThread,
} from '@api/collections/agent-strategies/services/agent-strategy-thread-publish.util';
import type { ResolvedAutonomousPostPolicy } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import {
  AgentAutonomyMode,
  AgentPublishDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

const STRATEGY = {
  brandId: 'brand-1',
  id: 'strategy-1',
  organizationId: 'org-1',
} as unknown as AgentStrategyDocument;

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
  const resolveForTarget = vi
    .fn()
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
  const patch = vi.fn().mockResolvedValue({ id: 'draft-1' });
  const deps = {
    autonomousPublishPolicy: { resolveForTarget, scheduleWithinPostCaps },
    postAccountFanoutService: {
      resolveDefaultTarget: vi.fn().mockResolvedValue({
        caption: 'One\n\nTwo',
        credentialId: 'credential-1',
        platform: 'twitter',
      }),
    },
    postsService: { patch },
  } as unknown as AutopilotThreadPublishDependencies;
  return { deps, patch, resolveForTarget, scheduleWithinPostCaps };
}

const INPUT = {
  draftId: 'draft-1',
  platform: 'twitter',
  qualityScore: 90,
  segments: ['One', 'Two'],
  strategy: STRATEGY,
  userId: 'user-1',
};

describe('publishAutopilotThread post caps (#7458)', () => {
  it('counts the Policy post caps and schedules the root under one brand lock', async () => {
    const { deps, patch, resolveForTarget, scheduleWithinPostCaps } =
      makeDeps();

    const result = await publishAutopilotThread(deps, INPUT);

    expect(result).toEqual({ postIds: ['draft-1'], scheduled: true });
    expect(scheduleWithinPostCaps).toHaveBeenCalledWith(
      { brandId: 'brand-1', organizationId: 'org-1' },
      expect.anything(),
      expect.any(Function),
      expect.any(Function),
    );
    // Once before the lock, once under it.
    expect(resolveForTarget).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        targetExecutionState: TargetExecutionState.SCHEDULED,
      }),
    );
  });

  it('keeps the thread a draft when the lock shows the last slot is gone', async () => {
    const { deps, patch, resolveForTarget } = makeDeps();
    resolveForTarget
      .mockResolvedValueOnce(policy(AgentPublishDecision.PERMITTED))
      .mockResolvedValueOnce(
        policy(AgentPublishDecision.DENIED, 'The daily cap is reached.'),
      );

    const result = await publishAutopilotThread(deps, INPUT);

    expect(result).toEqual({
      policyReason: 'The daily cap is reached.',
      postIds: [],
      scheduled: false,
    });
    expect(patch).not.toHaveBeenCalled();
  });

  it('reports a denial from the first evaluation without evaluating again', async () => {
    const { deps, patch, resolveForTarget } = makeDeps();
    resolveForTarget.mockResolvedValue(
      policy(AgentPublishDecision.DENIED, 'Approval is required.'),
    );

    const result = await publishAutopilotThread(deps, INPUT);

    expect(result).toEqual({
      policyReason: 'Approval is required.',
      postIds: [],
      scheduled: false,
    });
    expect(patch).not.toHaveBeenCalled();
    expect(resolveForTarget).toHaveBeenCalledTimes(1);
  });
});
