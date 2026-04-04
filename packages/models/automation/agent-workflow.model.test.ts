import { AgentWorkflow } from '@models/automation/agent-workflow.model';

describe('AgentWorkflow model', () => {
  it('creates a default exploring workflow', () => {
    const workflow = new AgentWorkflow();

    expect(workflow.currentPhase).toBe('exploring');
    expect(workflow.gateStatus.exploring).toBe(true);
  });

  it('accepts partial overrides', () => {
    const workflow = new AgentWorkflow({
      agentId: 'agent-1',
      currentPhase: 'verifying',
      linkedConversationId: 'thread-1',
    });

    expect(workflow.agentId).toBe('agent-1');
    expect(workflow.currentPhase).toBe('verifying');
    expect(workflow.linkedConversationId).toBe('thread-1');
  });
});
