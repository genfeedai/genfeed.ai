import type { ClientService } from '@mcp/services/client.service';
import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';
import { executionFailureResult } from '@mcp/tools/execution-failure-result';

type WorkflowControlToolResult = Promise<{
  content: Array<{ text: string; type: 'text' }>;
}>;

function requiredStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} required`);
  }
  return value;
}

function optionalStringArg(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function optionalNumberArg(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function requiredBooleanArg(
  args: Record<string, unknown>,
  key: string,
): boolean {
  const value = args[key];
  if (typeof value !== 'boolean') {
    throw new Error(`${key} required`);
  }
  return value;
}

function textDataResult(label: string, payload: unknown) {
  const failure = executionFailureResult(payload);
  return {
    ...failure,
    structuredContent: { data: payload, ...failure.structuredContent },
    content: [
      {
        text: `${label}:\n\n${formatToolData(payload)}`,
        type: 'text' as const,
      },
    ],
  };
}

export function handleWorkflowControlTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  const handlers: Record<
    string,
    (args: Record<string, unknown>) => WorkflowControlToolResult
  > = {
    duplicate_workflow: async (a) => {
      const workflow = await client.duplicateWorkflow(
        requiredStringArg(a, 'workflowId'),
      );
      return textDataResult('Workflow duplicated', workflow);
    },
    get_workflow_run: async (a) => {
      const run = await client.getWorkflowRun(requiredStringArg(a, 'runId'));
      return textDataResult('Workflow run', run);
    },
    install_system_workflow: async (a) => {
      const workflow = await client.installSystemWorkflow({
        brandId: optionalStringArg(a, 'brandId'),
        canonicalId: requiredStringArg(a, 'canonicalId'),
      });
      return textDataResult('System workflow installed', workflow);
    },
    inspect_workflow: async (a) => {
      const workflow = await client.inspectWorkflow(
        requiredStringArg(a, 'workflowId'),
      );
      return textDataResult('Workflow', workflow);
    },
    list_system_workflow_catalog: async (a) => {
      const entries = await client.listSystemWorkflowCatalog({
        family: optionalStringArg(a, 'family'),
        includeNonInstallable: a.includeNonInstallable === true,
        installedOnly: a.installedOnly === true,
      });
      return textDataResult('System workflow catalog', entries);
    },
    list_workflow_runs: async (a) => {
      const runs = await client.listWorkflowRuns({
        limit: optionalNumberArg(a, 'limit'),
        offset: optionalNumberArg(a, 'offset'),
        status: optionalStringArg(a, 'status'),
        trigger: optionalStringArg(a, 'trigger'),
        workflowId: optionalStringArg(a, 'workflowId'),
      });
      return textDataResult('Workflow runs', runs);
    },
    set_workflow_schedule: async (a) => {
      const result = await client.setWorkflowSchedule(
        requiredStringArg(a, 'workflowId'),
        {
          enabled: requiredBooleanArg(a, 'enabled'),
          schedule: optionalStringArg(a, 'schedule'),
          timezone: optionalStringArg(a, 'timezone'),
        },
      );
      return textDataResult('Workflow schedule updated', result);
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown workflow control tool: ${name}`);
  return handler(args);
}
