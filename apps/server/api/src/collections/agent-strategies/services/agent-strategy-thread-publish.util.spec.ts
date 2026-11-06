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
import { describe, expect, it } from 'vitest';

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

interface PublishHarness {
  decisions: ResolvedAutonomousPostPolicy[];
  deps: AutopilotThreadPublishDependencies;
  evaluations: number;
  locks: unknown[];
  patches: Array<{ id: string; update: Record<string, unknown> }>;
}

function makeHarness(
  decisions: ResolvedAutonomousPostPolicy[] = [
    policy(AgentPublishDecision.PERMITTED),
  ],
): PublishHarness {
  const harness: PublishHarness = {
    decisions,
    deps: {} as AutopilotThreadPublishDependencies,
    evaluations: 0,
    locks: [],
    patches: [],
  };
  const resolveForTarget = async () => {
    const index = Math.min(harness.evaluations, decisions.length - 1);
    harness.evaluations += 1;
    return decisions[index] as ResolvedAutonomousPostPolicy;
  };
  // A brand with caps: the policy is evaluated again under the lock.
  const scheduleWithinPostCaps = async (
    scope: unknown,
    preview: ResolvedAutonomousPostPolicy,
    evaluate: () => Promise<ResolvedAutonomousPostPolicy>,
    schedule: () => Promise<unknown>,
  ) => {
    harness.locks.push(scope);
    if (preview.result.decision !== AgentPublishDecision.PERMITTED)
      return { policy: preview };
    const decided = await evaluate();
    return decided.result.decision === AgentPublishDecision.PERMITTED
      ? { policy: decided, scheduled: await schedule() }
      : { policy: decided };
  };
  harness.deps = {
    autonomousPublishPolicy: { resolveForTarget, scheduleWithinPostCaps },
    postAccountFanoutService: {
      resolveDefaultTarget: async () => ({
        caption: 'One\n\nTwo',
        credentialId: 'credential-1',
        platform: 'twitter',
      }),
    },
    postsService: {
      patch: async (id: string, update: Record<string, unknown>) => {
        harness.patches.push({ id, update });
        return { id };
      },
    },
  } as unknown as AutopilotThreadPublishDependencies;
  return harness;
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
    const harness = makeHarness();

    const result = await publishAutopilotThread(harness.deps, INPUT);

    expect(result).toEqual({ postIds: ['draft-1'], scheduled: true });
    expect(harness.locks).toEqual([
      { brandId: 'brand-1', organizationId: 'org-1' },
    ]);
    // Once before the lock, once under it.
    expect(harness.evaluations).toBe(2);
    expect(harness.patches).toEqual([
      {
        id: 'draft-1',
        update: expect.objectContaining({
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      },
    ]);
  });

  it('keeps the thread a draft when the lock shows the last slot is gone', async () => {
    const harness = makeHarness([
      policy(AgentPublishDecision.PERMITTED),
      policy(AgentPublishDecision.DENIED, 'The daily cap is reached.'),
    ]);

    const result = await publishAutopilotThread(harness.deps, INPUT);

    expect(result).toEqual({
      policyReason: 'The daily cap is reached.',
      postIds: [],
      scheduled: false,
    });
    expect(harness.patches).toEqual([]);
  });

  it('reports a denial from the first evaluation without evaluating again', async () => {
    const harness = makeHarness([
      policy(AgentPublishDecision.DENIED, 'Approval is required.'),
    ]);

    const result = await publishAutopilotThread(harness.deps, INPUT);

    expect(result).toEqual({
      policyReason: 'Approval is required.',
      postIds: [],
      scheduled: false,
    });
    expect(harness.patches).toEqual([]);
    expect(harness.evaluations).toBe(1);
  });
});
