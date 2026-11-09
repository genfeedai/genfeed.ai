import { describe, expect, it } from 'vitest';
import {
  AGENT_RUN_VOCABULARY,
  AGENT_RUNTIME_STATE_THREAD_RUN_STATUS,
  isTerminalAgentThreadRunStatus,
  projectAgentTransferStatus,
} from './agent-run-vocabulary';
import { AgentRuntimeState } from './agent-runtime-state.enum';
import { AgentTransferStatus } from './agent-transfer.enum';
import { WorkflowExecutionStatus } from './workflow.enum';

describe('AGENT_RUN_VOCABULARY', () => {
  it.each([
    [
      WorkflowExecutionStatus.PENDING,
      AgentRuntimeState.RUNNING,
      'running',
      AgentTransferStatus.FAILED,
    ],
    [
      WorkflowExecutionStatus.RUNNING,
      AgentRuntimeState.RUNNING,
      'running',
      AgentTransferStatus.RUNNING,
    ],
    [
      WorkflowExecutionStatus.COMPLETED,
      AgentRuntimeState.COMPLETED,
      'completed',
      AgentTransferStatus.COMPLETED,
    ],
    [
      WorkflowExecutionStatus.FAILED,
      AgentRuntimeState.FAILED,
      'failed',
      AgentTransferStatus.FAILED,
    ],
    [
      WorkflowExecutionStatus.CANCELLED,
      AgentRuntimeState.CANCELLED,
      'cancelled',
      AgentTransferStatus.CANCELLED,
    ],
  ])(
    'execution %s is runtime %s, thread %s, transfer %s',
    (status, runtimeState, threadRunStatus, transferStatus) => {
      expect(AGENT_RUN_VOCABULARY[status]).toEqual({
        runtimeState,
        threadRunStatus,
        transferStatus,
      });
    },
  );
});

describe('AGENT_RUNTIME_STATE_THREAD_RUN_STATUS', () => {
  it.each([
    [AgentRuntimeState.READY, 'idle'],
    [AgentRuntimeState.RUNNING, 'running'],
    [AgentRuntimeState.AWAITING_INPUT, 'waiting_input'],
    [AgentRuntimeState.AWAITING_CONFIRMATION, 'waiting_input'],
    [AgentRuntimeState.COMPLETED, 'completed'],
    [AgentRuntimeState.FAILED, 'failed'],
    [AgentRuntimeState.CANCELLED, 'cancelled'],
    [AgentRuntimeState.INTERRUPTED, 'cancelled'],
    [AgentRuntimeState.RESTORING, 'idle'],
  ])('runtime %s shows as %s', (state, expected) => {
    expect(AGENT_RUNTIME_STATE_THREAD_RUN_STATUS[state]).toBe(expected);
  });
});

describe('isTerminalAgentThreadRunStatus', () => {
  it.each([
    [undefined, false],
    ['idle', false],
    ['running', false],
    ['waiting_input', false],
    ['completed', true],
    ['failed', true],
    ['cancelled', true],
  ] as const)('%s is terminal: %s', (status, expected) => {
    expect(isTerminalAgentThreadRunStatus(status)).toBe(expected);
  });
});

describe('projectAgentTransferStatus', () => {
  it.each([
    [WorkflowExecutionStatus.RUNNING, AgentTransferStatus.RUNNING],
    [WorkflowExecutionStatus.COMPLETED, AgentTransferStatus.COMPLETED],
    [WorkflowExecutionStatus.CANCELLED, AgentTransferStatus.CANCELLED],
    [WorkflowExecutionStatus.FAILED, AgentTransferStatus.FAILED],
    [WorkflowExecutionStatus.PENDING, AgentTransferStatus.FAILED],
    ['running', AgentTransferStatus.FAILED],
    ['unrecognized-status', AgentTransferStatus.FAILED],
  ])('projects execution %s to transfer %s', (status, expected) => {
    expect(projectAgentTransferStatus(status)).toBe(expected);
  });
});
