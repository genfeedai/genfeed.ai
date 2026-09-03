import { describe, expect, it } from 'vitest';
import {
  AGENT_RUNTIME_STATE_LABELS,
  AgentRuntimeState,
  formatAgentRuntimeStateLabel,
  isAgentRuntimeTerminalState,
  isStaleRunningProjection,
  resolveAgentRuntimeState,
} from '../../src/enums/agent-runtime-state.enum';

describe('AgentRuntimeState', () => {
  it('exposes the FR-1 product vocabulary', () => {
    expect(Object.values(AgentRuntimeState)).toEqual([
      'ready',
      'running',
      'awaiting_input',
      'awaiting_confirmation',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
      'restoring',
    ]);
  });

  it('labels every member for visible status text', () => {
    expect(Object.keys(AGENT_RUNTIME_STATE_LABELS)).toHaveLength(9);
    expect(formatAgentRuntimeStateLabel(AgentRuntimeState.AWAITING_INPUT)).toBe(
      'Awaiting input',
    );
  });
});

describe('resolveAgentRuntimeState', () => {
  it('maps idle and empty sources to ready', () => {
    expect(resolveAgentRuntimeState({})).toBe(AgentRuntimeState.READY);
    expect(resolveAgentRuntimeState({ snapshotStatus: 'idle' })).toBe(
      AgentRuntimeState.READY,
    );
  });

  it('maps queued and pending execution to running', () => {
    expect(resolveAgentRuntimeState({ snapshotStatus: 'queued' })).toBe(
      AgentRuntimeState.RUNNING,
    );
    expect(resolveAgentRuntimeState({ workflowStatus: 'PENDING' })).toBe(
      AgentRuntimeState.RUNNING,
    );
  });

  it('keeps waiting_input distinct from running', () => {
    expect(resolveAgentRuntimeState({ snapshotStatus: 'waiting_input' })).toBe(
      AgentRuntimeState.AWAITING_INPUT,
    );
    expect(
      resolveAgentRuntimeState({
        pendingInputCount: 1,
        snapshotStatus: 'running',
      }),
    ).toBe(AgentRuntimeState.AWAITING_INPUT);
  });

  it('promotes pending confirmation above a live snapshot', () => {
    expect(
      resolveAgentRuntimeState({
        hasPendingConfirmation: true,
        snapshotStatus: 'running',
      }),
    ).toBe(AgentRuntimeState.AWAITING_CONFIRMATION);
  });

  it('never renders a terminal durable state as running', () => {
    expect(
      resolveAgentRuntimeState({
        snapshotStatus: 'running',
        workflowStatus: 'COMPLETED',
      }),
    ).toBe(AgentRuntimeState.COMPLETED);
    expect(
      resolveAgentRuntimeState({
        snapshotStatus: 'queued',
        workflowStatus: 'FAILED',
      }),
    ).toBe(AgentRuntimeState.FAILED);
    expect(
      resolveAgentRuntimeState({
        snapshotStatus: 'running',
        workflowStatus: 'CANCELLED',
      }),
    ).toBe(AgentRuntimeState.CANCELLED);
    expect(resolveAgentRuntimeState({ snapshotStatus: 'interrupted' })).toBe(
      AgentRuntimeState.INTERRUPTED,
    );
  });

  it('keeps a snapshot terminal when the workflow row is still pending', () => {
    expect(
      resolveAgentRuntimeState({
        snapshotStatus: 'failed',
        workflowStatus: 'RUNNING',
      }),
    ).toBe(AgentRuntimeState.FAILED);
  });

  it('marks restoring only when the client is hydrating', () => {
    expect(
      resolveAgentRuntimeState({
        isRestoring: true,
        snapshotStatus: 'running',
      }),
    ).toBe(AgentRuntimeState.RESTORING);
  });
});

describe('isStaleRunningProjection', () => {
  it('flags a running glyph against a terminal snapshot or execution', () => {
    expect(
      isStaleRunningProjection({
        renderedState: AgentRuntimeState.RUNNING,
        snapshotStatus: 'completed',
      }),
    ).toBe(true);
    expect(
      isStaleRunningProjection({
        renderedState: AgentRuntimeState.RUNNING,
        workflowStatus: 'FAILED',
      }),
    ).toBe(true);
  });

  it('does not flag a truthful running or terminal render', () => {
    expect(
      isStaleRunningProjection({
        renderedState: AgentRuntimeState.RUNNING,
        snapshotStatus: 'running',
      }),
    ).toBe(false);
    expect(
      isStaleRunningProjection({
        renderedState: AgentRuntimeState.COMPLETED,
        snapshotStatus: 'completed',
      }),
    ).toBe(false);
  });
});

describe('isAgentRuntimeTerminalState', () => {
  it('treats interrupted as terminal and restoring as live', () => {
    expect(isAgentRuntimeTerminalState(AgentRuntimeState.INTERRUPTED)).toBe(
      true,
    );
    expect(isAgentRuntimeTerminalState(AgentRuntimeState.RESTORING)).toBe(
      false,
    );
  });
});
