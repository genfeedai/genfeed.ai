import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { AgentRuntimeState, AgentThreadStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  canRenderRunAsRunning,
  groupAgentRuns,
  projectThreadToRun,
} from './agent-runs-list.helpers';

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    contextVersion: 1,
    createdAt: '2026-09-03T00:00:00.000Z',
    id: 'thread-1',
    status: AgentThreadStatus.ACTIVE,
    updatedAt: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('projectThreadToRun', () => {
  it('omits ready and completed threads', () => {
    expect(
      projectThreadToRun(
        makeThread({ runStatus: 'idle', runtimeState: 'ready' }),
      ),
    ).toBeNull();
    expect(
      projectThreadToRun(
        makeThread({ runStatus: 'completed', runtimeState: 'completed' }),
      ),
    ).toBeNull();
  });

  it('keeps awaiting and failed runs', () => {
    expect(
      projectThreadToRun(
        makeThread({
          pendingInputCount: 1,
          runStatus: 'waiting_input',
          runtimeState: 'awaiting_input',
        }),
      )?.runtimeState,
    ).toBe(AgentRuntimeState.AWAITING_INPUT);
    expect(
      projectThreadToRun(
        makeThread({ runStatus: 'failed', runtimeState: 'failed' }),
      )?.runtimeState,
    ).toBe(AgentRuntimeState.FAILED);
  });

  it('never maps a terminal durable state to running', () => {
    const completed = projectThreadToRun(
      makeThread({ runStatus: 'running', runtimeState: 'completed' }),
    );
    expect(completed).toBeNull();
    expect(canRenderRunAsRunning(AgentRuntimeState.COMPLETED)).toBe(false);
    expect(canRenderRunAsRunning(AgentRuntimeState.FAILED)).toBe(false);
    expect(canRenderRunAsRunning(AgentRuntimeState.INTERRUPTED)).toBe(false);
  });
});

describe('groupAgentRuns', () => {
  it('splits awaiting, working, and failed', () => {
    const grouped = groupAgentRuns([
      {
        decisionHref: '/agent/a',
        id: 'a',
        isProjectionStale: false,
        runtimeState: AgentRuntimeState.AWAITING_CONFIRMATION,
        threadId: 'a',
        threadTitle: 'A',
      },
      {
        decisionHref: '/agent/b',
        id: 'b',
        isProjectionStale: false,
        runtimeState: AgentRuntimeState.RUNNING,
        threadId: 'b',
        threadTitle: 'B',
      },
      {
        decisionHref: '/agent/c',
        id: 'c',
        isProjectionStale: false,
        runtimeState: AgentRuntimeState.INTERRUPTED,
        threadId: 'c',
        threadTitle: 'C',
      },
    ]);

    expect(grouped.awaiting).toHaveLength(1);
    expect(grouped.working).toHaveLength(1);
    expect(grouped.failed).toHaveLength(1);
  });
});
