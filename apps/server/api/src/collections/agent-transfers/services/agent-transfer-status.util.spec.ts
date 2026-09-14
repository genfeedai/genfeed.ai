import { projectAgentTransferStatus } from '@api/collections/agent-transfers/services/agent-transfer-status.util';
import {
  AgentTransferStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('projectAgentTransferStatus', () => {
  it.each([
    [WorkflowExecutionStatus.RUNNING, AgentTransferStatus.RUNNING],
    [WorkflowExecutionStatus.COMPLETED, AgentTransferStatus.COMPLETED],
    [WorkflowExecutionStatus.CANCELLED, AgentTransferStatus.CANCELLED],
    [WorkflowExecutionStatus.FAILED, AgentTransferStatus.FAILED],
    [WorkflowExecutionStatus.PAUSED, AgentTransferStatus.FAILED],
    ['unrecognized-status', AgentTransferStatus.FAILED],
  ])('projects execution %s to transfer %s', (status, expected) => {
    expect(projectAgentTransferStatus(status)).toBe(expected);
  });
});
