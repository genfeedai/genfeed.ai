import { describe, expect, it } from 'vitest';
import {
  type AgentThreadUiActionRun,
  deriveAgentUiActionStates,
  isAgentUiActionSourceOwner,
} from '../../src/interfaces/ai/agent-ui-action.interface';

function run(
  runId: string,
  queuedSequence: number,
  settled?: Pick<AgentThreadUiActionRun, 'status' | 'terminalSequence'>,
): AgentThreadUiActionRun {
  return {
    action: 'approve_plan',
    queuedSequence,
    runId,
    sourceId: 'plan-1',
    status: 'pending',
    updatedAt: '2026-09-28T09:00:00.000Z',
    ...settled,
  };
}

const key = 'approve_plan:plan-1';

describe('ui-action run card view', () => {
  it('shows the latest queued run while any run on the source is pending', () => {
    const states = deriveAgentUiActionStates([
      run('a', 1),
      run('b', 2),
      run('c', 3, { status: 'cancelled', terminalSequence: 4 }),
    ]);

    expect(states[key]).toMatchObject({ runId: 'b', status: 'pending' });
  });

  it('never lets a duplicate failure override an earlier success', () => {
    const runs = [
      run('a', 1, { status: 'completed', terminalSequence: 5 }),
      run('b', 2, { status: 'failed', terminalSequence: 7 }),
    ];

    expect(deriveAgentUiActionStates(runs)[key]).toMatchObject({
      runId: 'a',
      sequence: 5,
      status: 'completed',
    });
    expect(
      isAgentUiActionSourceOwner(runs, { runId: 'b', sourceId: 'plan-1' }),
    ).toBe(false);
    expect(
      isAgentUiActionSourceOwner(runs, { runId: 'a', sourceId: 'plan-1' }),
    ).toBe(true);
  });

  it('orders completed runs by the lane, even one settled without its terminal sequence', () => {
    const runs = [
      run('a', 1, { status: 'completed', terminalSequence: 9 }),
      run('b', 2, { status: 'completed' }),
    ];

    expect(deriveAgentUiActionStates(runs)[key]?.runId).toBe('b');
    expect(
      isAgentUiActionSourceOwner(runs, { runId: 'a', sourceId: 'plan-1' }),
    ).toBe(false);
  });

  it('lets an earlier success take the source back from a duplicate failure that arrived first', () => {
    const duplicate = run('b', 2, { status: 'failed', terminalSequence: 9 });
    expect(
      isAgentUiActionSourceOwner([run('a', 1), duplicate], {
        runId: 'b',
        sourceId: 'plan-1',
      }),
    ).toBe(true);

    expect(
      isAgentUiActionSourceOwner(
        [run('a', 1, { status: 'completed', terminalSequence: 7 }), duplicate],
        { runId: 'a', sequence: 7, sourceId: 'plan-1' },
      ),
    ).toBe(true);
  });

  it('applies an untracked result unless a tracked run resolved the source later', () => {
    const runs = [run('a', 1, { status: 'completed', terminalSequence: 7 })];

    expect(
      isAgentUiActionSourceOwner(runs, {
        runId: 'elsewhere',
        sequence: 5,
        sourceId: 'plan-1',
      }),
    ).toBe(false);
    expect(
      isAgentUiActionSourceOwner(runs, {
        runId: 'elsewhere',
        sequence: 9,
        sourceId: 'plan-1',
      }),
    ).toBe(true);
  });
});
