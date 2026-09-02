import { WorkflowExecutionStatus, WorkflowExecutionTrigger } from '@genfeedai/contracts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { requireAuth } from '@/api/client';
import {
  getWorkflow,
  getWorkflowExecution,
  listWorkflowExecutions,
  listWorkflows,
  type Workflow,
  type WorkflowExecution,
} from '@/api/workflows';
import { runWorkflow } from '@/operations/workflows';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';
import { parsePositiveInteger } from '@/utils/options';

interface ListOptions {
  json?: boolean;
  limit: number;
}

interface RunListOptions extends ListOptions {
  status?: WorkflowExecutionStatus;
  workflow?: string;
}

interface RunOptions {
  inputs?: string;
  json?: boolean;
  trigger: WorkflowExecutionTrigger;
}

interface JsonOutputOptions {
  json?: boolean;
}

function parseExecutionStatus(value: string): WorkflowExecutionStatus {
  const normalized = value.trim().toUpperCase();
  if (!Object.values(WorkflowExecutionStatus).includes(normalized as WorkflowExecutionStatus)) {
    throw new GenfeedError(
      `Unknown workflow run status "${value}"`,
      `Use one of: ${Object.values(WorkflowExecutionStatus).join(', ')}`
    );
  }
  return normalized as WorkflowExecutionStatus;
}

function parseExecutionTrigger(value: string): WorkflowExecutionTrigger {
  const normalized = value.trim().toLowerCase();
  if (!Object.values(WorkflowExecutionTrigger).includes(normalized as WorkflowExecutionTrigger)) {
    throw new GenfeedError(
      `Unknown workflow trigger "${value}"`,
      `Use one of: ${Object.values(WorkflowExecutionTrigger).join(', ')}`
    );
  }
  return normalized as WorkflowExecutionTrigger;
}

function parseInputsOption(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new GenfeedError('--inputs must be a JSON object');
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new GenfeedError('--inputs must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function printWorkflow(workflow: Workflow): void {
  const status = workflow.status
    ? workflow.status === 'active'
      ? chalk.green(workflow.status)
      : chalk.dim(workflow.status)
    : '';
  print(
    `  ${chalk.cyan(workflow.label ?? workflow.key ?? workflow.id)} ${chalk.dim(`(${workflow.id})`)} ${status}`
  );
  if (workflow.description) print(`  ${chalk.dim(workflow.description)}`);
  print();
}

function printExecution(execution: WorkflowExecution): void {
  print(
    `  ${chalk.cyan(execution.workflow?.label ?? execution.workflowId ?? 'Workflow')} ${chalk.dim(`(${execution.id})`)} ${execution.status ?? ''}`
  );
}

async function withCommandError(action: () => Promise<void>): Promise<void> {
  try {
    await requireAuth();
    await action();
  } catch (error) {
    handleError(error);
  }
}

export const workflowCommand = new Command('workflow')
  .description('List and run workflows')
  .addCommand(
    new Command('list')
      .description('List available workflows')
      .option('-l, --limit <n>', 'Max items', parsePositiveInteger, 20)
      .option('--json', 'Output as JSON')
      .action((options: ListOptions) =>
        withCommandError(async () => {
          const spinner = ora('Fetching workflows...').start();
          try {
            const workflows = await listWorkflows(options);
            spinner.stop();
            if (options.json) return printJson(workflows);
            if (workflows.length === 0) return print(chalk.dim('No workflows found.'));
            print(formatHeader('\nWorkflows:\n'));
            workflows.forEach(printWorkflow);
          } catch (error) {
            spinner.fail('Failed to fetch workflows');
            throw error;
          }
        })
      )
  )
  .addCommand(
    new Command('run')
      .description('Execute a workflow by ID, key, or exact label')
      .argument('<workflow>', 'Workflow ID, key, or exact label')
      .option('--inputs <json>', 'JSON object of workflow input variables')
      .option(
        '-t, --trigger <trigger>',
        'Execution trigger',
        parseExecutionTrigger,
        WorkflowExecutionTrigger.MANUAL
      )
      .option('--json', 'Output as JSON')
      .action((reference: string, options: RunOptions) =>
        withCommandError(async () => {
          const inputs = options.inputs ? parseInputsOption(options.inputs) : undefined;
          const spinner = ora('Executing workflow...').start();
          try {
            const result = await runWorkflow(reference, inputs, options.trigger);
            spinner.succeed('Workflow execution started');
            if (options.json) {
              return printJson({
                executionId: result.execution.id,
                workflowId: result.workflow.id,
              });
            }
            print(formatLabel('Workflow', result.workflow.label ?? result.workflow.id));
            print(formatLabel('Execution ID', result.execution.id));
          } catch (error) {
            spinner.fail('Failed to execute workflow');
            throw error;
          }
        })
      )
  )
  .addCommand(
    new Command('runs')
      .description('List workflow runs')
      .option('--workflow <id>', 'Filter by workflow ID')
      .option('--status <status>', 'Filter by run status', parseExecutionStatus)
      .option('-l, --limit <n>', 'Max items', parsePositiveInteger, 20)
      .option('--json', 'Output as JSON')
      .action((options: RunListOptions) =>
        withCommandError(async () => {
          const runs = await listWorkflowExecutions({
            limit: options.limit,
            status: options.status,
            workflowId: options.workflow,
          });
          if (options.json) return printJson(runs);
          if (runs.length === 0) return print(chalk.dim('No workflow runs found.'));
          print(formatHeader('\nWorkflow runs:\n'));
          runs.forEach(printExecution);
        })
      )
  )
  .addCommand(
    new Command('status')
      .description('Show one workflow run')
      .argument('<execution-id>', 'Workflow execution ID')
      .option('--json', 'Output as JSON')
      .action((id: string, options: JsonOutputOptions) =>
        withCommandError(async () => {
          const execution = await getWorkflowExecution(id);
          if (options.json) return printJson(execution);
          print(formatHeader('\nWorkflow run:\n'));
          print(formatLabel('ID', execution.id));
          print(formatLabel('Workflow', execution.workflow?.label ?? execution.workflowId ?? '-'));
          print(formatLabel('Status', execution.status ?? '-'));
          if (execution.error) print(formatLabel('Error', execution.error));
        })
      )
  )
  .addCommand(
    new Command('show')
      .description('Show workflow details')
      .argument('<id>', 'Workflow ID')
      .option('--json', 'Output as JSON')
      .action((id: string, options: JsonOutputOptions) =>
        withCommandError(async () => {
          const workflow = await getWorkflow(id);
          if (options.json) return printJson(workflow);
          print(formatHeader('\nWorkflow details:\n'));
          print(formatLabel('ID', workflow.id));
          if (workflow.label) print(formatLabel('Label', workflow.label));
          if (workflow.key) print(formatLabel('Key', workflow.key));
          if (workflow.description) print(formatLabel('Description', workflow.description));
          if (workflow.status) print(formatLabel('Status', workflow.status));
          if (workflow.nodes?.length) {
            print(formatHeader('\nNodes:\n'));
            for (const node of workflow.nodes) {
              print(`  ${node.data?.label ?? node.id} ${chalk.blue(`[${node.type}]`)}`);
            }
          }
        })
      )
  );
