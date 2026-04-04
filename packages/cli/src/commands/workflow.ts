import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { get, post, requireAuth } from '@/api/client.js';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from '@/api/json-api.js';
import { formatHeader, formatLabel, print, printJson } from '@/ui/theme.js';
import { handleError } from '@/utils/errors.js';

interface Workflow {
  id: string;
  label?: string;
  description?: string;
  key?: string;
  status?: string;
  steps?: WorkflowStep[];
  createdAt?: string;
  updatedAt?: string;
}

interface WorkflowStep {
  id: string;
  label?: string;
  type?: string;
  order?: number;
}

interface WorkflowExecution {
  id: string;
}

export const workflowCommand = new Command('workflow')
  .description('Manage and execute workflows')
  .addCommand(
    new Command('list')
      .description('List available workflows')
      .option('--status <status>', 'Filter by status (draft, active, paused, completed, failed)')
      .option('-l, --limit <n>', 'Max items', Number.parseInt, 20)
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          await requireAuth();

          const spinner = ora('Fetching workflows...').start();
          try {
            const query = new URLSearchParams();
            if (options.status) query.set('status', options.status);
            if (options.limit) query.set('limit', String(options.limit));
            const qs = query.toString();
            const path = qs ? `/workflows?${qs}` : '/workflows';

            const response = await get<JsonApiCollectionResponse>(path);
            const workflows = flattenCollection<Workflow>(response);
            spinner.stop();

            if (workflows.length === 0) {
              print(chalk.dim('No workflows found.'));
              return;
            }

            if (options.json) {
              printJson(workflows);
              return;
            }

            print(formatHeader('\nWorkflows:\n'));
            for (const wf of workflows) {
              const status = wf.status
                ? wf.status === 'active'
                  ? chalk.green(wf.status)
                  : chalk.dim(wf.status)
                : '';
              print(
                `  ${chalk.cyan(wf.label ?? wf.key ?? wf.id)} ${chalk.dim(`(${wf.id})`)} ${status}`
              );
              if (wf.description) {
                print(`  ${chalk.dim(wf.description)}`);
              }
              print();
            }
          } catch (error) {
            spinner.fail('Failed to fetch workflows');
            throw error;
          }
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('run')
      .description('Execute a workflow')
      .argument('<id>', 'Workflow ID to execute')
      .option('--inputs <json>', 'JSON object of input variables for the workflow')
      .option('-t, --trigger <trigger>', 'Execution trigger', 'manual')
      .option('--json', 'Output as JSON')
      .action(async (id, options) => {
        try {
          await requireAuth();

          let inputs: Record<string, unknown> | undefined;
          if (options.inputs) {
            inputs = JSON.parse(options.inputs) as Record<string, unknown>;
          }

          const spinner = ora('Executing workflow...').start();
          try {
            const body: Record<string, unknown> = {
              trigger: options.trigger,
              workflow: id,
            };
            if (inputs) {
              body.inputs = inputs;
            }

            const response = await post<JsonApiSingleResponse>('/workflow-executions', body);
            const execution = flattenSingle<WorkflowExecution>(response);
            spinner.succeed('Workflow execution started');

            if (options.json) {
              printJson({ executionId: execution.id, workflowId: id });
            } else {
              print(chalk.dim(`Execution ID: ${execution.id}`));
            }
          } catch (error) {
            spinner.fail('Failed to execute workflow');
            throw error;
          }
        } catch (error) {
          handleError(error);
        }
      })
  )
  .addCommand(
    new Command('show')
      .description('Show workflow details')
      .argument('<id>', 'Workflow ID')
      .option('--json', 'Output as JSON')
      .action(async (id, options) => {
        try {
          await requireAuth();

          const spinner = ora('Fetching workflow...').start();
          try {
            const response = await get<JsonApiSingleResponse>(`/workflows/${id}`);
            const workflow = flattenSingle<Workflow>(response);
            spinner.stop();

            if (options.json) {
              printJson(workflow);
              return;
            }

            print(formatHeader('\nWorkflow Details:\n'));
            print(formatLabel('ID', workflow.id));
            if (workflow.label) {
              print(formatLabel('Label', workflow.label));
            }
            if (workflow.key) {
              print(formatLabel('Key', workflow.key));
            }
            if (workflow.description) {
              print(formatLabel('Description', workflow.description));
            }
            if (workflow.status) {
              print(formatLabel('Status', workflow.status));
            }

            if (workflow.steps?.length) {
              print();
              print(formatHeader('Steps:\n'));
              for (const step of workflow.steps) {
                const type = step.type ? chalk.blue(`[${step.type}]`) : '';
                print(`  ${chalk.dim(`${step.order ?? '-'}.`)} ${step.label ?? step.id} ${type}`);
              }
            }
          } catch (error) {
            spinner.fail('Failed to fetch workflow');
            throw error;
          }
        } catch (error) {
          handleError(error);
        }
      })
  );
