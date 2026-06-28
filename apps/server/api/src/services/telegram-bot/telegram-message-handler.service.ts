/**
 * Telegram Message Handler Service
 *
 * Handles raw photo and text messages: downloading photos from Telegram,
 * feeding them into the active conversation as collected inputs, capturing a
 * pending generation reference image, and routing free-text prompts to either
 * input collection or a pending-image generate run.
 */

import type { TelegramConversationService } from '@api/services/telegram-bot/telegram-conversation.service';
import type { TelegramRunCommandsService } from '@api/services/telegram-bot/telegram-run-commands.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Context } from 'grammy';

export class TelegramMessageHandlerService {
  private botToken?: string;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly conversation: TelegramConversationService,
    private readonly runCommands: TelegramRunCommandsService,
  ) {}

  setBotToken(token: string): void {
    this.botToken = token;
  }

  /** Handle an incoming photo (image input or pending generation reference). */
  async handlePhoto(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.message?.photo) {
      return;
    }

    if (this.conversation.shouldThrottlePhoto(chatId)) {
      await ctx.reply('⏱ Please wait a second before sending another photo.');
      return;
    }

    const state = this.conversation.getState(chatId);
    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];

    if (!state || state.step !== 'collecting_inputs') {
      try {
        const { fileUrl, tmpPath } = await this.downloadPhotoFromTelegram(
          ctx,
          bestPhoto.file_id,
          chatId,
          'agent-generate',
        );

        this.conversation.setPendingImage(chatId, fileUrl);
        // Do not log fileUrl: it embeds the bot token (bot<token>) in the path.
        this.loggerService.log(
          'TelegramBotService: Pending generation photo saved',
          { chatId, tmpPath },
        );

        await ctx.reply(
          '📸 Image received.\nNow send your prompt as a normal message and I will generate from it.',
        );
      } catch (error) {
        this.loggerService.error(
          'TelegramBotService: Failed to store pending generation photo',
          { error },
        );
        await ctx.reply('❌ Failed to download the photo. Please try again.');
      }
      return;
    }

    const currentInput = state.requiredInputs[state.currentInputIndex];
    if (!currentInput || currentInput.inputType !== 'image') {
      await ctx.reply(
        "I'm not expecting an image right now. Please send text.",
      );
      return;
    }

    try {
      const { fileUrl, tmpPath } = await this.downloadPhotoFromTelegram(
        ctx,
        bestPhoto.file_id,
        chatId,
        currentInput.nodeId,
      );

      // Store the Telegram file URL (Replicate can fetch from URLs)
      // We keep the local path too for potential local processing
      state.collectedInputs.set(currentInput.nodeId, fileUrl);
      state.currentInputIndex++;

      // Do not log fileUrl: it embeds the bot token (bot<token>) in the path.
      this.loggerService.log(
        `TelegramBotService: Image saved for node ${currentInput.nodeId}`,
        { tmpPath },
      );

      await this.conversation.promptNextInput(ctx, chatId);
    } catch (error) {
      this.loggerService.error('TelegramBotService: Failed to download photo', {
        error,
      });
      await ctx.reply('❌ Failed to download the photo. Please try again.');
    }
  }

  /** Handle an incoming text message (prompt input or pending generation). */
  async handleText(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.message?.text) {
      return;
    }

    // Skip if it's a command
    if (ctx.message.text.startsWith('/')) {
      return;
    }

    const state = this.conversation.getState(chatId);
    if (!state) {
      const pendingImageUrl = this.conversation.peekPendingImage(chatId);
      const prompt = ctx.message.text.trim();
      if (pendingImageUrl && prompt.length > 0) {
        this.conversation.clearPendingImage(chatId);
        await this.runCommands.runGenerate(ctx, { pendingImageUrl, prompt });
      }
      return;
    }

    if (state.step !== 'collecting_inputs') {
      return;
    }

    const currentInput = state.requiredInputs[state.currentInputIndex];
    if (!currentInput || currentInput.inputType !== 'text') {
      await ctx.reply("I'm expecting an image, not text. Please send a photo.");
      return;
    }

    // Handle "default" keyword
    let text = ctx.message.text;
    if (text.toLowerCase() === 'default' && currentInput.defaultValue) {
      text = currentInput.defaultValue;
    }

    state.collectedInputs.set(currentInput.nodeId, text);
    state.currentInputIndex++;

    await this.conversation.promptNextInput(ctx, chatId);
  }

  private async downloadPhotoFromTelegram(
    ctx: Context,
    fileId: string,
    chatId: number,
    nodeId: string,
  ): Promise<{ fileUrl: string; tmpPath: string }> {
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;

    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = path.join(os.tmpdir(), 'genfeed-tg-bot');
    await fs.mkdir(tmpDir, { recursive: true });

    const ext = path.extname(file.file_path || '.jpg') || '.jpg';
    const tmpPath = path.join(
      tmpDir,
      `${chatId}-${nodeId}-${Date.now()}${ext}`,
    );

    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);

    return { fileUrl, tmpPath };
  }
}
