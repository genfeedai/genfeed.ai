import {
  createWorkflowExecution,
  getWorkflow,
  listWorkflows,
  type Workflow,
  type WorkflowExecution,
} from '@/api/workflows';
import { ApiError, GenfeedError } from '@/utils/errors';

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

export async function resolveWorkflow(reference: string): Promise<Workflow> {
  try {
    return await getWorkflow(reference);
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 404) {
      throw error;
    }
  }

  const workflows = await listWorkflows({ limit: 100 });
  const target = normalized(reference);
  const matches = workflows.filter(
    (workflow) =>
      normalized(workflow.id) === target ||
      normalized(workflow.key) === target ||
      normalized(workflow.label) === target
  );

  if (matches.length === 0) {
    throw new GenfeedError(`No workflow matches "${reference}"`);
  }
  if (matches.length > 1) {
    throw new GenfeedError(`"${reference}" matches more than one workflow; use its ID instead`);
  }
  return matches[0];
}

export interface RunWorkflowResult {
  execution: WorkflowExecution;
  workflow: Workflow;
}

export async function runWorkflow(
  reference: string,
  inputValues?: Record<string, unknown>,
  trigger = 'manual'
): Promise<RunWorkflowResult> {
  const workflow = await resolveWorkflow(reference);
  const execution = await createWorkflowExecution({
    ...(inputValues ? { inputValues } : {}),
    trigger,
    workflowId: workflow.id,
  });
  return { execution, workflow };
}
