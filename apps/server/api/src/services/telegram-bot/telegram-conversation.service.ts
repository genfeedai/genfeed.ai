/**
 * Telegram Conversation Service
 *
 * Owns the conversational workflow runner: listing/selecting workflows,
 * collecting inputs over multiple messages, confirmation, editing, and handing
 * a confirmed run to the workflow runner. Sole owner of per-chat conversation
 * state, pending generation images, and the loaded workflow map; the message
 * handler reaches this state through the small public API below.
 */

import { TELEGRAM_BOT_CONSTANTS } from '@api/services/telegram-bot/telegram-bot.constants';
import type {
  ConversationState,
  WorkflowJson,
} from '@api/services/telegram-bot/telegram-bot.types';
import { extractWorkflowInputs } from '@api/services/telegram-bot/telegram-workflow-loader';
import type { TelegramWorkflowRunnerService } from '@api/services/telegram-bot/telegram-workflow-runner.service';
import { ParseMode } from '@genfeedai/enums';
import type { WorkflowEngine } from '@genfeedai/workflows/engine';
import type { LoggerService } from '@libs/logger/logger.service';
import { type Context, InlineKeyboard } from 'grammy';

export class TelegramConversationService {
  private readonly conversations: Map<number, ConversationState> = new Map();
  private readonly pendingGenerationImages: Map<number, string> = new Map();
  private readonly recentPhotoTimestamps: Map<number, number> = new Map();
  private workflows: Map<string, WorkflowJson> = new Map();
  private engine: WorkflowEngine | null = null;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly runner: TelegramWorkflowRunnerService,
  ) {}

  setWorkflows(workflows: Map<string, WorkflowJson>): void {
    this.workflows = workflows;
  }

  getWorkflows(): Map<string, WorkflowJson> {
    return this.workflows;
  }

  workflowsLoaded(): number {
    return this.workflows.size;
  }

  attachEngine(engine: WorkflowEngine): void {
    this.engine = engine;
  }

  hasEngine(): boolean {
    return !!this.engine;
  }

  getActiveCount(): number {
    return this.conversations.size;
  }

  isExecuting(chatId: number): boolean {
    return this.conversations.get(chatId)?.step === 'executing';
  }

  /** Active conversation state for a chat (mutated in place by callers). */
  getState(chatId: number): ConversationState | undefined {
    return this.conversations.get(chatId);
  }

  setPendingImage(chatId: number, url: string): void {
    this.pendingGenerationImages.set(chatId, url);
  }

  peekPendingImage(chatId: number): string | undefined {
    return this.pendingGenerationImages.get(chatId);
  }

  clearPendingImage(chatId: number): void {
    this.pendingGenerationImages.delete(chatId);
  }

  /** Take (read + clear) the pending generation image for a chat. */
  takePendingImage(chatId: number): string | undefined {
    const url = this.pendingGenerationImages.get(chatId);
    if (url) {
      this.pendingGenerationImages.delete(chatId);
    }
    return url;
  }

  /**
   * Photo-throttle gate: returns true (and replies should be sent by the caller)
   * when a photo arrives within 1.5s of the previous one; otherwise records the
   * timestamp and returns false.
   */
  shouldThrottlePhoto(chatId: number): boolean {
    const now = Date.now();
    const previousPhotoAt = this.recentPhotoTimestamps.get(chatId) || 0;
    if (now - previousPhotoAt < 1500) {
      return true;
    }
    this.recentPhotoTimestamps.set(chatId, now);
    return false;
  }

  /** Describe the current status of a chat for the /status command. */
  describeStatus(chatId?: number): {
    statusLine: string;
    hasPendingImage: boolean;
  } {
    const state = chatId ? this.conversations.get(chatId) : undefined;

    let statusLine = '💤 Idle';
    if (state) {
      switch (state.step) {
        case 'selecting_workflow':
          statusLine = '📋 Selecting workflow';
          break;
        case 'collecting_inputs':
          statusLine = `📝 Collecting inputs (${state.currentInputIndex}/${state.requiredInputs.length})`;
          break;
        case 'confirming':
          statusLine = '✅ Waiting for confirmation';
          break;
        case 'executing':
          statusLine = `⏳ Running: ${state.workflowName}`;
          break;
      }
    }

    return {
      hasPendingImage: chatId
        ? this.pendingGenerationImages.has(chatId)
        : false,
      statusLine,
    };
  }

  /** Clear conversation + pending state and confirm the cancellation. */
  private async resetConversation(ctx: Context, chatId: number): Promise<void> {
    this.conversations.delete(chatId);
    this.pendingGenerationImages.delete(chatId);
    await ctx.reply('❌ Cancelled. Send /workflows to start again.');
  }

  /** /cancel - cancel the current conversation unless mid-execution. */
  async handleCancelCommand(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    if (this.isExecuting(chatId)) {
      await ctx.reply(
        '⚠️ Workflow is running and cannot be cancelled mid-execution. Please wait for it to finish.',
      );
      return;
    }

    await this.resetConversation(ctx, chatId);
  }

  /** Dispatch an inline-keyboard callback query. */
  async handleCallbackQuery(ctx: Context): Promise<void> {
    const data = ctx.callbackQuery?.data;
    const chatId = ctx.chat?.id;
    if (!data || !chatId) {
      return;
    }

    await ctx.answerCallbackQuery();

    const { CALLBACK_PREFIX } = TELEGRAM_BOT_CONSTANTS;

    // Block new workflow selection if one is running
    if (data.startsWith(CALLBACK_PREFIX.WORKFLOW_SELECT)) {
      if (this.isExecuting(chatId)) {
        await ctx.reply('⏳ A workflow is already running. Please wait.');
        return;
      }
      const workflowId = data.slice(CALLBACK_PREFIX.WORKFLOW_SELECT.length);
      await this.handleWorkflowSelect(ctx, chatId, workflowId);
      return;
    }

    // Once a run is in flight, ignore confirm/edit/cancel taps: a double-tap on
    // Run would execute the workflow twice, and Edit/Cancel would mutate or
    // clear the conversation while the original run is still executing.
    if (
      (data === CALLBACK_PREFIX.CONFIRM_RUN ||
        data === CALLBACK_PREFIX.CONFIRM_EDIT ||
        data === CALLBACK_PREFIX.CONFIRM_CANCEL) &&
      this.isExecuting(chatId)
    ) {
      await ctx.reply('⏳ A workflow is already running. Please wait.');
      return;
    }

    const handlers: Record<string, () => Promise<void>> = {
      [CALLBACK_PREFIX.CONFIRM_CANCEL]: () =>
        this.resetConversation(ctx, chatId),
      [CALLBACK_PREFIX.CONFIRM_EDIT]: () => this.handleEditInputs(ctx, chatId),
      [CALLBACK_PREFIX.CONFIRM_RUN]: () => this.handleConfirmRun(ctx, chatId),
    };

    await handlers[data]?.();
  }

  /** Display available workflows as an inline keyboard. */
  async handleWorkflowList(ctx: Context): Promise<void> {
    const keyboard = new InlineKeyboard();

    for (const [id, workflow] of this.workflows) {
      keyboard
        .text(
          `${workflow.name}`,
          `${TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.WORKFLOW_SELECT}${id}`,
        )
        .row();
    }

    await ctx.reply(
      '🎬 **GenFeed AI Workflows**\n\nSelect a workflow to run:',
      {
        parse_mode: ParseMode.MARKDOWN,
        reply_markup: keyboard,
      },
    );
  }

  /** Handle workflow selection and start collecting inputs. */
  private async handleWorkflowSelect(
    ctx: Context,
    chatId: number,
    workflowId: string,
  ): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      await ctx.reply('❌ Workflow not found.');
      return;
    }

    const requiredInputs = extractWorkflowInputs(workflow);

    const state: ConversationState = {
      collectedInputs: new Map(),
      currentInputIndex: 0,
      requiredInputs,
      startedAt: Date.now(),
      step: 'collecting_inputs',
      workflow,
      workflowId,
      workflowName: workflow.name,
    };

    this.conversations.set(chatId, state);

    await ctx.reply(
      `📋 **${workflow.name}**\n${workflow.description}\n\n` +
        `This workflow needs ${requiredInputs.length} input(s). Let's collect them.`,
      { parse_mode: ParseMode.MARKDOWN },
    );

    await this.promptNextInput(ctx, chatId);
  }

  /** Prompt for the next required input or move to confirmation. */
  async promptNextInput(ctx: Context, chatId: number): Promise<void> {
    const state = this.conversations.get(chatId);
    if (!state) {
      return;
    }

    // All inputs collected → confirm
    if (state.currentInputIndex >= state.requiredInputs.length) {
      state.step = 'confirming';
      await this.showConfirmation(ctx, chatId);
      return;
    }

    const input = state.requiredInputs[state.currentInputIndex];
    const progress = `(${state.currentInputIndex + 1}/${state.requiredInputs.length})`;

    switch (input.inputType) {
      case 'image':
        await ctx.reply(
          `📸 ${progress} **${input.label}**\nPlease send a photo.`,
          { parse_mode: ParseMode.MARKDOWN },
        );
        break;
      case 'text': {
        const defaultHint = input.defaultValue
          ? `\n\n_Default: "${input.defaultValue.substring(0, 100)}..."_\n\nSend your text or type \`default\` to use the default.`
          : '';
        await ctx.reply(
          `✏️ ${progress} **${input.label}**\nPlease type your text.${defaultHint}`,
          { parse_mode: ParseMode.MARKDOWN },
        );
        break;
      }
      case 'audio':
        await ctx.reply(
          `🎵 ${progress} **${input.label}**\nPlease send an audio file.`,
          { parse_mode: ParseMode.MARKDOWN },
        );
        break;
      case 'video':
        await ctx.reply(
          `🎬 ${progress} **${input.label}**\nPlease send a video.`,
          { parse_mode: ParseMode.MARKDOWN },
        );
        break;
    }
  }

  /** Show confirmation with a collected-inputs summary. */
  private async showConfirmation(ctx: Context, chatId: number): Promise<void> {
    const state = this.conversations.get(chatId);
    if (!state) {
      return;
    }

    let summary = `✅ **Ready to run: ${state.workflowName}**\n\n`;
    for (const input of state.requiredInputs) {
      const value = state.collectedInputs.get(input.nodeId);
      switch (input.inputType) {
        case 'audio':
          summary += `🎵 ${input.label}: Audio received ✓\n`;
          break;
        case 'image':
          summary += `📸 ${input.label}: Image received ✓\n`;
          break;
        case 'text': {
          const displayValue = value
            ? value.length > 80
              ? `${value.substring(0, 80)}...`
              : value
            : '(empty)';
          summary += `✏️ ${input.label}: "${displayValue}"\n`;
          break;
        }
        case 'video':
          summary += `🎬 ${input.label}: Video received ✓\n`;
          break;
        default: {
          const displayFallback = value
            ? value.length > 80
              ? `${value.substring(0, 80)}...`
              : value
            : '(received)';
          summary += `📎 ${input.label}: ${displayFallback}\n`;
          break;
        }
      }
    }

    const keyboard = new InlineKeyboard()
      .text('▶️ Run', TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.CONFIRM_RUN)
      .text('✏️ Edit', TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.CONFIRM_EDIT)
      .text('❌ Cancel', TELEGRAM_BOT_CONSTANTS.CALLBACK_PREFIX.CONFIRM_CANCEL);

    await ctx.reply(summary, {
      parse_mode: ParseMode.MARKDOWN,
      reply_markup: keyboard,
    });
  }

  /** Execute the workflow with collected inputs via the workflow runner. */
  private async handleConfirmRun(ctx: Context, chatId: number): Promise<void> {
    const state = this.conversations.get(chatId);
    if (!state || !state.workflow) {
      await ctx.reply('❌ No workflow to run. Send /workflows to start.');
      return;
    }

    if (!this.engine) {
      await ctx.reply('❌ Workflow engine is not initialized.');
      this.conversations.delete(chatId);
      return;
    }

    try {
      await this.runner.execute(ctx, chatId, state, this.engine);
    } finally {
      this.conversations.delete(chatId);
    }
  }

  /** Reset input collection for editing. */
  private async handleEditInputs(ctx: Context, chatId: number): Promise<void> {
    const state = this.conversations.get(chatId);
    if (!state) {
      return;
    }

    state.step = 'collecting_inputs';
    state.currentInputIndex = 0;
    state.collectedInputs.clear();

    await ctx.reply("🔄 Let's collect inputs again.");
    await this.promptNextInput(ctx, chatId);
  }
}
