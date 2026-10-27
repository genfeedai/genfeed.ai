import {
  applyWorkflowOperationEvidence,
  closeWorkflowDispatch,
} from '@api/helpers/utils/credits/workflow-generation-evidence.util';
import { workflowFundingFixture } from '@api/helpers/utils/credits/workflow-generation-funding.fixture';
import { calculateWorkflowGenerationSettlement } from '@api/helpers/utils/credits/workflow-generation-settlement.util';
import type { WorkflowExecutionGenerationBilling } from '@genfeedai/contracts/interfaces/billing';
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');

const now = new Date('2026-09-30T00:01:00.000Z');

/** The fixture's frozen tariffs: the video node quotes 5 credits, the image node 1. */
const QUOTED_CREDITS = [5, 1];

/**
 * How one funded node ends: its provider returned an output, failed, was
 * never submitted, or was submitted with no answer yet. `isLate` lands the
 * provider's answer after dispatch closed, as a late callback does.
 */
type Outcome = 'completed' | 'failed' | 'unsubmitted' | 'pending';
interface NodeRun {
  outcome: Outcome;
  isLate: boolean;
}

const nodeRunArbitrary = fc.record({
  isLate: fc.boolean(),
  outcome: fc.constantFrom<Outcome>(
    'completed',
    'failed',
    'unsubmitted',
    'pending',
  ),
});

const runArbitrary = fc.record({
  executionId: fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
  nodes: fc.tuple(nodeRunArbitrary, nodeRunArbitrary),
  /** Which node's evidence the system hears about first. */
  isReversed: fc.boolean(),
});

function operationIdAt(
  plan: WorkflowExecutionGenerationBilling,
  index: number,
) {
  return plan.manifest.allocations[index].operationId;
}

function submit(plan: WorkflowExecutionGenerationBilling, index: number) {
  const operationId = operationIdAt(plan, index);
  const claimed = applyWorkflowOperationEvidence(
    plan,
    { claimId: `claim-${index}`, operationId, phase: 'claimed' },
    now,
  );
  return applyWorkflowOperationEvidence(
    claimed,
    {
      intentId: operationId,
      observedAt: now.toISOString(),
      operationId,
      phase: 'submission-intent',
    },
    now,
  );
}

function answer(
  plan: WorkflowExecutionGenerationBilling,
  index: number,
  outcome: 'completed' | 'failed',
) {
  const operationId = operationIdAt(plan, index);
  const base = {
    intentId: operationId,
    observedAt: now.toISOString(),
    operationId,
    proofId: `proof-${index}`,
  };
  return applyWorkflowOperationEvidence(
    plan,
    outcome === 'completed'
      ? {
          ...base,
          artifacts: [
            {
              assetKey: `durable/output-${index}`,
              ingredientId: `asset-${index}`,
              role: 'primary',
            },
          ],
          completion: { completedOutputs: 1, successfulRequests: 1 },
          phase: 'completed',
        }
      : {
          ...base,
          kind: 'provider-terminal',
          phase: 'failed',
          provider: 'replicate',
        },
    now,
  );
}

/** Plays a run's evidence in the given order, closing dispatch in between. */
function play(
  executionId: string,
  nodes: readonly NodeRun[],
  isReversed: boolean,
) {
  const order = nodes.map((_, index) => index);
  if (isReversed) order.reverse();
  let plan = workflowFundingFixture(executionId);
  for (const index of order)
    if (nodes[index]?.outcome !== 'unsubmitted') plan = submit(plan, index);
  const answerAll = (isLate: boolean) => {
    for (const index of order) {
      const node = nodes[index];
      if (
        node &&
        node.isLate === isLate &&
        (node.outcome === 'completed' || node.outcome === 'failed')
      )
        plan = answer(plan, index, node.outcome);
    }
  };
  answerAll(false);
  const open = plan;
  plan = closeWorkflowDispatch(plan, now);
  answerAll(true);
  return { closed: plan, open };
}

describe('workflow settlement properties', () => {
  it('never settles while dispatch is open', () => {
    fc.assert(
      fc.property(runArbitrary, ({ executionId, isReversed, nodes }) => {
        const { open } = play(executionId, nodes, isReversed);

        expect(calculateWorkflowGenerationSettlement(open)).toBeNull();
      }),
    );
  });

  it('waits for every submitted node to answer before settling', () => {
    fc.assert(
      fc.property(runArbitrary, ({ executionId, isReversed, nodes }) => {
        const { closed } = play(executionId, nodes, isReversed);
        const settlement = calculateWorkflowGenerationSettlement(closed);

        expect(settlement === null).toBe(
          nodes.some((node) => node.outcome === 'pending'),
        );
      }),
    );
  });

  it('charges exactly the frozen quote of each completed node, inside the hold', () => {
    fc.assert(
      fc.property(runArbitrary, ({ executionId, isReversed, nodes }) => {
        fc.pre(nodes.every((node) => node.outcome !== 'pending'));
        const { closed } = play(executionId, nodes, isReversed);
        const settlement = calculateWorkflowGenerationSettlement(closed);
        const expected = nodes.reduce(
          (sum, node, index) =>
            node.outcome === 'completed'
              ? sum + (QUOTED_CREDITS[index] ?? 0)
              : sum,
          0,
        );

        expect(settlement?.actualAmount).toBe(expected);
        expect(settlement?.actualAmount).toBeLessThanOrEqual(
          Number(closed.holdAmount),
        );
        expect(
          settlement?.operations.map((operation) => operation.credits),
        ).toEqual(
          nodes.map((node, index) =>
            node.outcome === 'completed' ? QUOTED_CREDITS[index] : 0,
          ),
        );
      }),
    );
  });

  it('settles the same whichever order the evidence arrived in', () => {
    fc.assert(
      fc.property(runArbitrary, ({ executionId, nodes }) => {
        const forward = play(executionId, nodes, false).closed;
        const backward = play(executionId, nodes, true).closed;

        expect(calculateWorkflowGenerationSettlement(backward)).toEqual(
          calculateWorkflowGenerationSettlement(forward),
        );
      }),
    );
  });
});
