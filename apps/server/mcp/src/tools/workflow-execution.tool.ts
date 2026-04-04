import type { ClientService } from '@mcp/services/client.service';
import type { WorkflowStatus } from '@mcp/shared/interfaces/workflow.interface';

function isWorkflowStatus(value: string): value is WorkflowStatus {
  return ['draft', 'active', 'paused', 'completed', 'failed'].includes(value);
}

export function createWorkflowExecutionTool(client: ClientService) {
  return {
    description:
      'Execute a workflow automation. Triggers a sequence of AI actions defined in a workflow template.',

    async handler(params: {
      workflowId: string;
      inputs?: Record<string, unknown>;
    }) {
      const result = await client.executeWorkflow({
        variables: params.inputs,
        workflowId: params.workflowId,
      });
      return {
        content: [
          {
            text: JSON.stringify(result, null, 2),
            type: 'text' as const,
          },
        ],
      };
    },
    inputSchema: {
      properties: {
        inputs: {
          description: 'Input parameters for the workflow (JSON object)',
          type: 'object',
        },
        workflowId: {
          description: 'ID of the workflow to execute',
          type: 'string',
        },
      },
      required: ['workflowId'],
      type: 'object' as const,
    },
    name: 'execute_workflow',
  };
}

export function createWorkflowListTool(client: ClientService) {
  return {
    description: 'List available workflows and their status.',

    async handler(params: { status?: string; limit?: number }) {
      const result = await client.listWorkflows({
        limit: params.limit || 20,
        status:
          params.status && isWorkflowStatus(params.status)
            ? params.status
            : undefined,
      });
      return {
        content: [
          {
            text: JSON.stringify(result, null, 2),
            type: 'text' as const,
          },
        ],
      };
    },
    inputSchema: {
      properties: {
        limit: {
          description: 'Max items to return',
          type: 'number',
        },
        status: {
          description: 'Filter by status',
          type: 'string',
        },
      },
      required: [],
      type: 'object' as const,
    },
    name: 'list_workflows',
  };
}
