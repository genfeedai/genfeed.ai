import type { ClientService } from '@mcp/services/client.service';

export const WORKFLOW_STATUS_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  'get_workflow_status',
  'list_workflow_templates',
]);

export async function handleWorkflowStatusTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'get_workflow_status': {
      if (!args?.workflowId) {
        throw new Error('workflowId required');
      }
      const workflow = await client.getWorkflowStatus(
        args.workflowId as string,
      );

      return {
        content: [
          {
            text: `Workflow Status: ${workflow.name}\n\nID: ${workflow.id}\nStatus: ${workflow.status}\nVersion: ${workflow.version ?? 'N/A'}\nNodes: ${workflow.nodeCount ?? 0}\nLast Run: ${workflow.lastRunAt || 'Never'}\nNext Run: ${workflow.nextRunAt || 'Not scheduled'}`,
            type: 'text' as const,
          },
        ],
      };
    }
    case 'list_workflow_templates': {
      const templates = await client.listWorkflowTemplates();

      return {
        content: [
          {
            text:
              templates.length > 0
                ? `Available Workflow Templates:\n\n${templates.map((t) => `- ${t.name} (${t.id})\n  ${t.description}\n  Category: ${t.category}${t.creditsRequired ? `\n  Credits: ${t.creditsRequired}` : ''}`).join('\n\n')}`
                : 'No workflow templates available.',
            type: 'text' as const,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown workflow-status tool: ${name}`);
  }
}
