import { formatAgentFailureMessage } from '@genfeedai/agent/server';
import { extractWorkflowOutputsFromExecution } from '@genfeedai/integrations';
import type { DiscordWorkflowExecutionClient } from './discord-workflow-execution.client';

interface WorkflowMonitorLogger {
  error(...args: unknown[]): void;
}

interface DiscordWorkflowMonitorOptions {
  deleteSession(): void;
  executionClient: DiscordWorkflowExecutionClient;
  executionId: string;
  logger: WorkflowMonitorLogger;
  orgId: string;
  send(message: string): Promise<unknown>;
}

export async function monitorDiscordWorkflowExecution(
  options: DiscordWorkflowMonitorOptions,
): Promise<void> {
  try {
    const execution = await options.executionClient.waitForTerminal(
      options.orgId,
      options.executionId,
    );

    if (execution.status === 'cancelled') {
      options.deleteSession();
      return;
    }

    if (execution.status === 'failed') {
      await options.send(formatAgentFailureMessage(execution.error));
      options.deleteSession();
      return;
    }

    const outputs = extractWorkflowOutputsFromExecution(execution);

    if (outputs.length > 0) {
      for (const output of outputs) {
        if (output.url) {
          await options.send(
            `${output.caption || `Generated ${output.type}`}\n${output.url}`,
          );
        } else if (output.text) {
          await options.send(output.text);
        }
      }
    } else {
      await options.send('Workflow completed successfully.');
    }

    options.deleteSession();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Workflow execution polling timed out'
    ) {
      await options.send(
        'Workflow is still running. Use /status to check progress.',
      );
      return;
    }

    options.logger.error('Failed while monitoring workflow execution:', error);
    await options.send(
      formatAgentFailureMessage(
        error instanceof Error ? error.message : undefined,
      ),
    );
    options.deleteSession();
  }
}
