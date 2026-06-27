/**
 * Telegram Workflow Runner Service
 *
 * Owns the execution side of a confirmed workflow run: converting the workflow,
 * driving the engine, streaming progress back into the Telegram status message,
 * and rendering the final results. Extracted from TelegramBotService so the
 * conversation state machine only orchestrates and this collaborator executes.
 */

import type { ConversationState } from '@api/services/telegram-bot/telegram-bot.types';
import { toExecutableWorkflow } from '@api/services/telegram-bot/telegram-workflow-loader';
import { ParseMode } from '@genfeedai/enums';
import type {
  ExecutionProgressEvent,
  ExecutionRunResult,
  WorkflowEngine,
} from '@genfeedai/workflow-engine';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Context } from 'grammy';

export class TelegramWorkflowRunnerService {
  constructor(private readonly loggerService: LoggerService) {}

  /**
   * Execute a confirmed workflow run and report progress/results to the chat.
   * The caller owns conversation-state lifecycle (this method does not delete it).
   */
  async execute(
    ctx: Context,
    chatId: number,
    state: ConversationState,
    engine: WorkflowEngine,
  ): Promise<void> {
    const { workflow } = state;
    if (!workflow) {
      return;
    }

    state.step = 'executing';

    const statusMsg = await ctx.reply(
      `⏳ **Running: ${state.workflowName}**\n` +
        `Processing ${workflow.nodes.length} nodes...\n\n` +
        `🔄 Starting...`,
      { parse_mode: ParseMode.MARKDOWN },
    );
    state.statusMessageId = statusMsg.message_id;

    const startTime = Date.now();

    try {
      // Convert workflow JSON → ExecutableWorkflow
      const executableWorkflow = toExecutableWorkflow(
        workflow,
        state.collectedInputs,
        state.workflowId || 'unknown',
      );

      this.loggerService.log(
        'TelegramBotService: Starting workflow execution',
        {
          chatId,
          nodeCount: executableWorkflow.nodes.length,
          workflowId: state.workflowId,
          workflowName: state.workflowName,
        },
      );

      // Execute with progress callbacks
      const result: ExecutionRunResult = await engine.execute(
        executableWorkflow,
        {
          onProgress: (event: ExecutionProgressEvent) => {
            // Update status message with progress
            this.updateProgressMessage(ctx, chatId, state, event).catch(() => {
              /* ignore update errors */
            });
          },
        },
      );

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      if (result.status === 'completed') {
        // Find output node results
        await this.sendResults(ctx, chatId, result, durationSec);
      } else {
        await ctx.reply(
          `❌ **Workflow failed**\n\n` +
            `Error: ${result.error || 'Unknown error'}\n` +
            `Duration: ${durationSec}s\n` +
            `Credits used: ${result.totalCreditsUsed}`,
          { parse_mode: ParseMode.MARKDOWN },
        );
      }
    } catch (error) {
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      this.loggerService.error(
        'TelegramBotService: Workflow execution failed',
        {
          chatId,
          error,
        },
      );
      await ctx.reply(
        `❌ **Error running workflow**\n\n` +
          `${error instanceof Error ? error.message : 'Unknown error'}\n` +
          `Duration: ${durationSec}s`,
        { parse_mode: ParseMode.MARKDOWN },
      );
    }
  }

  /**
   * Update the progress status message in Telegram.
   */
  private async updateProgressMessage(
    ctx: Context,
    chatId: number,
    state: ConversationState,
    event: ExecutionProgressEvent,
  ): Promise<void> {
    if (!state.statusMessageId) {
      return;
    }

    const progressBar = this.renderProgressBar(event.progress);
    const currentNode = event.currentNodeLabel || event.currentNodeId || '';

    try {
      await ctx.api.editMessageText(
        chatId,
        state.statusMessageId,
        `⏳ **Running: ${state.workflowName}**\n\n` +
          `${progressBar} ${event.progress}%\n` +
          `🔧 ${currentNode}\n` +
          `✅ ${event.completedNodes.length} completed`,
        { parse_mode: ParseMode.MARKDOWN },
      );
    } catch {
      // Ignore "message not modified" errors
    }
  }

  /**
   * Render a text-based progress bar.
   */
  private renderProgressBar(progress: number): string {
    const filled = Math.round(progress / 10);
    const empty = 10 - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Send workflow results back to the user.
   */
  private async sendResults(
    ctx: Context,
    _chatId: number,
    result: ExecutionRunResult,
    durationSec: string,
  ): Promise<void> {
    // Collect all outputs from output nodes
    const outputs: Array<{ type: string; url: string }> = [];

    for (const [_nodeId, nodeResult] of result.nodeResults) {
      if (nodeResult.status !== 'completed' || !nodeResult.output) {
        continue;
      }

      const output = nodeResult.output as Record<string, unknown>;

      if (output.image && typeof output.image === 'string') {
        outputs.push({ type: 'image', url: output.image });
      }
      if (output.video && typeof output.video === 'string') {
        outputs.push({ type: 'video', url: output.video });
      }
    }

    // Send completion summary
    await ctx.reply(
      `✅ **Workflow completed!**\n\n` +
        `⏱ Duration: ${durationSec}s\n` +
        `💰 Credits used: ${result.totalCreditsUsed}\n` +
        `📦 Outputs: ${outputs.length} file(s)`,
      { parse_mode: ParseMode.MARKDOWN },
    );

    // Send each output file
    for (const output of outputs) {
      try {
        if (output.type === 'image') {
          await ctx.replyWithPhoto(output.url, {
            caption: '🖼 Generated Image',
          });
        } else if (output.type === 'video') {
          await ctx.replyWithVideo(output.url, {
            caption: '🎬 Generated Video',
          });
        }
      } catch (error) {
        this.loggerService.error(
          'TelegramBotService: Failed to send output file',
          { error, output },
        );
        // Fallback: send as URL
        await ctx.reply(
          `📎 ${output.type === 'image' ? '🖼' : '🎬'} Output URL: ${output.url}`,
        );
      }
    }

    if (outputs.length === 0) {
      // Send raw node outputs for debugging
      const allOutputs: string[] = [];
      for (const [nodeId, nodeResult] of result.nodeResults) {
        if (nodeResult.output) {
          allOutputs.push(
            `${nodeId}: ${JSON.stringify(nodeResult.output).substring(0, 200)}`,
          );
        }
      }
      if (allOutputs.length > 0) {
        await ctx.reply(
          `📋 **Node outputs:**\n\`\`\`\n${allOutputs.join('\n')}\n\`\`\``,
          { parse_mode: ParseMode.MARKDOWN },
        );
      }
    }
  }
}
