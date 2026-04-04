import { createAgentWorkflowSchema } from '@api/workflows/agent-workflows.module';
import { AgentWorkflowSchema } from '@api/workflows/schemas/agent-workflow.schema';

describe('createAgentWorkflowSchema', () => {
  it('applies compound indexes in the module factory without mutating the base schema', () => {
    const schema = createAgentWorkflowSchema();
    const indexes = schema.indexes();

    expect(schema).not.toBe(AgentWorkflowSchema);
    expect(indexes).toEqual(
      expect.arrayContaining([
        [
          { agentId: 1, linkedConversationId: 1, organization: 1 },
          { name: 'idx_agent_workflows_conversation' },
        ],
        [
          { createdAt: -1, organization: 1, user: 1 },
          {
            name: 'idx_agent_workflows_user_created',
            partialFilterExpression: { isDeleted: false },
          },
        ],
      ]),
    );
    expect(AgentWorkflowSchema.indexes()).toHaveLength(0);
  });
});
