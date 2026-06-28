/**
 * Telegram Message Handler Service
 *
 * Handles raw photo and text messages: downloading photos from Telegram,
 * feeding them into the active conversation as collected inputs, capturing a
 * pending generation reference image, and routing free-text prompts to either
 * input collection or a pending-image generate run.
 */

import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { TelegramConversationService } from '@api/services/telegram-bot/telegram-conversation.service';
import type { TelegramRunCommandsService } from '@api/services/telegram-bot/telegram-run-commands.service';
import { FileInputType } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Context } from 'grammy';

export class TelegramMessageHandlerService {
  private botToken?: string;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly conversation: TelegramConversationService,
    private readonly runCommands: TelegramRunCommandsService,
    private readonly filesClientService?: FilesClientService,
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
        const { imageUrl } = await this.downloadPhotoFromTelegram(
          ctx,
          bestPhoto.file_id,
          chatId,
          'agent-generate',
        );

        this.conversation.setPendingImage(chatId, imageUrl);
        this.loggerService.log(
          'TelegramBotService: Pending generation photo saved',
          { chatId },
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
      const { imageUrl } = await this.downloadPhotoFromTelegram(
        ctx,
        bestPhoto.file_id,
        chatId,
        currentInput.nodeId,
      );

      // Store the re-hosted, token-free image URL; Replicate fetches from it.
      state.collectedInputs.set(currentInput.nodeId, imageUrl);
      state.currentInputIndex++;

      this.loggerService.log(
        `TelegramBotService: Image saved for node ${currentInput.nodeId}`,
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
        // Clear the pending image only after a successful generate so a failed
        // run leaves the reference image available for retry.
        await this.runCommands.runGenerate(ctx, { pendingImageUrl, prompt });
        this.conversation.clearPendingImage(chatId);
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

  /**
   * Download a Telegram photo and re-host it to our own storage, returning a
   * token-free public URL. The Telegram file URL embeds the long-lived bot
   * token (`bot<token>`), so it must never be persisted in conversation state,
   * forwarded to Replicate, or logged — it stays local to this method.
   */
  private async downloadPhotoFromTelegram(
    ctx: Context,
    fileId: string,
    chatId: number,
    nodeId: string,
  ): Promise<{ imageUrl: string }> {
    if (!this.filesClientService) {
      throw new Error('File storage service is unavailable');
    }

    const file = await ctx.api.getFile(fileId);
    const telegramFileUrl = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;

    const response = await fetch(telegramFileUrl);
    if (!response.ok) {
      throw new Error(`Telegram file download failed: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    const path = await import('node:path');
    const ext = path.extname(file.file_path || '') || '.jpg';
    const key = `telegram-uploads/${chatId}-${nodeId}-${Date.now()}${ext}`;

    const metadata = await this.filesClientService.uploadToS3(key, 'images', {
      contentType,
      data: buffer,
      type: FileInputType.BUFFER,
    });

    // Fail closed: never fall back to the tokenized Telegram URL.
    if (!metadata.publicUrl) {
      throw new Error('Re-hosted image did not return a public URL');
    }

    return { imageUrl: metadata.publicUrl };
  }
}
