/**
 * Telegram Message Handler Service
 *
 * Handles Telegram photo, audio, video, document, and text messages:
 * downloading media from Telegram, feeding it into the active conversation as
 * collected inputs, capturing a pending generation reference image, and routing
 * free-text prompts to either input collection or a pending-image generate run.
 */

import path from 'node:path';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type {
  ConversationState,
  WorkflowInput,
} from '@api/services/telegram-bot/telegram-bot.types';
import type { TelegramConversationService } from '@api/services/telegram-bot/telegram-conversation.service';
import type { TelegramRunCommandsService } from '@api/services/telegram-bot/telegram-run-commands.service';
import { FileInputType } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Context } from 'grammy';

type TelegramMediaInputType = Extract<
  WorkflowInput['inputType'],
  'audio' | 'video'
>;
type TelegramMediaWorkflowInput = WorkflowInput & {
  inputType: TelegramMediaInputType;
};

type TelegramMediaPayload = {
  defaultContentType: string;
  fallbackExtension: string;
  fileId: string;
  fileName?: string;
  mimeType?: string;
};

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

    if (state?.step !== 'collecting_inputs') {
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
    if (currentInput?.inputType !== 'image') {
      await ctx.reply(this.getExpectedInputMessage(currentInput?.inputType));
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
      this.collectInputValue(state, currentInput, imageUrl);
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

  /** Handle incoming Telegram audio or voice messages for audio inputs. */
  async handleAudio(ctx: Context): Promise<void> {
    const payload = this.getAudioPayload(ctx);
    if (!payload) {
      return;
    }

    await this.handleMedia(ctx, 'audio', payload);
  }

  /** Handle incoming Telegram video messages for video inputs. */
  async handleVideo(ctx: Context): Promise<void> {
    const payload = this.getVideoPayload(ctx);
    if (!payload) {
      return;
    }

    await this.handleMedia(ctx, 'video', payload);
  }

  /** Handle document uploads when they are used as audio/video workflow input. */
  async handleDocument(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const document = ctx.message?.document;
    if (!chatId || !document) {
      return;
    }

    const state = this.conversation.getState(chatId);
    if (state?.step !== 'collecting_inputs') {
      return;
    }

    const currentInput = state.requiredInputs[state.currentInputIndex];
    if (!this.isTelegramMediaInput(currentInput)) {
      await ctx.reply(this.getExpectedInputMessage(currentInput?.inputType));
      return;
    }

    const mimeType = document.mime_type;
    const inferredType = this.inferDocumentMediaType(mimeType);
    // Reject when the media type cannot be confirmed: an unrecognised MIME
    // (inferredType === undefined) must not be silently accepted into an
    // audio/video slot, and a confirmed mismatch is equally invalid.
    if (!inferredType || inferredType !== currentInput.inputType) {
      const reason = inferredType
        ? this.getExpectedInputMessage(currentInput.inputType)
        : `❌ The file type couldn't be recognized. Please send a valid ${currentInput.inputType} file.`;
      await ctx.reply(reason);
      return;
    }

    await this.collectMediaInput(ctx, chatId, state, currentInput, {
      defaultContentType:
        currentInput.inputType === 'audio' ? 'audio/mpeg' : 'video/mp4',
      fallbackExtension: currentInput.inputType === 'audio' ? '.mp3' : '.mp4',
      fileId: document.file_id,
      fileName: document.file_name,
      mimeType,
    });
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
    if (currentInput?.inputType !== 'text') {
      await ctx.reply(this.getExpectedInputMessage(currentInput?.inputType));
      return;
    }

    // Handle "default" keyword
    let text = ctx.message.text;
    if (text.toLowerCase() === 'default' && currentInput.defaultValue) {
      text = currentInput.defaultValue;
    }

    this.collectInputValue(state, currentInput, text);
    state.currentInputIndex++;

    await this.conversation.promptNextInput(ctx, chatId);
  }

  private getAudioPayload(ctx: Context): TelegramMediaPayload | undefined {
    const audio = ctx.message?.audio;
    if (audio) {
      return {
        defaultContentType: audio.mime_type || 'audio/mpeg',
        fallbackExtension: '.mp3',
        fileId: audio.file_id,
        fileName: audio.file_name,
        mimeType: audio.mime_type,
      };
    }

    const voice = ctx.message?.voice;
    if (voice) {
      return {
        defaultContentType: voice.mime_type || 'audio/ogg',
        fallbackExtension: '.ogg',
        fileId: voice.file_id,
        mimeType: voice.mime_type,
      };
    }

    return undefined;
  }

  private getVideoPayload(ctx: Context): TelegramMediaPayload | undefined {
    const video = ctx.message?.video;
    if (!video) {
      return undefined;
    }

    return {
      defaultContentType: video.mime_type || 'video/mp4',
      fallbackExtension: '.mp4',
      fileId: video.file_id,
      fileName: video.file_name,
      mimeType: video.mime_type,
    };
  }

  private inferDocumentMediaType(
    mimeType?: string,
  ): TelegramMediaInputType | undefined {
    if (mimeType?.startsWith('audio/')) {
      return 'audio';
    }

    if (mimeType?.startsWith('video/')) {
      return 'video';
    }

    return undefined;
  }

  private isTelegramMediaInput(
    input: WorkflowInput | undefined,
  ): input is TelegramMediaWorkflowInput {
    return (
      !!input && (input.inputType === 'audio' || input.inputType === 'video')
    );
  }

  private async handleMedia(
    ctx: Context,
    mediaType: TelegramMediaInputType,
    payload: TelegramMediaPayload,
  ): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      return;
    }

    const state = this.conversation.getState(chatId);
    if (state?.step !== 'collecting_inputs') {
      return;
    }

    const currentInput = state.requiredInputs[state.currentInputIndex];
    if (
      !this.isTelegramMediaInput(currentInput) ||
      currentInput.inputType !== mediaType
    ) {
      await ctx.reply(this.getExpectedInputMessage(currentInput?.inputType));
      return;
    }

    await this.collectMediaInput(ctx, chatId, state, currentInput, payload);
  }

  private async collectMediaInput(
    ctx: Context,
    chatId: number,
    state: ConversationState,
    currentInput: TelegramMediaWorkflowInput,
    payload: TelegramMediaPayload,
  ): Promise<void> {
    try {
      const mediaUrl = await this.downloadMediaFromTelegram(
        ctx,
        payload,
        chatId,
        currentInput.nodeId,
        currentInput.inputType,
      );

      this.collectInputValue(state, currentInput, mediaUrl);
      state.currentInputIndex++;

      this.loggerService.log(
        `TelegramBotService: ${currentInput.inputType} saved for node ${currentInput.nodeId}`,
      );

      await this.conversation.promptNextInput(ctx, chatId);
    } catch (error) {
      this.loggerService.error(
        `TelegramBotService: Failed to download ${currentInput.inputType}`,
        { error },
      );
      await ctx.reply(
        `❌ Failed to download the ${currentInput.inputType}. Please try again.`,
      );
    }
  }

  private getExpectedInputMessage(
    expected?: WorkflowInput['inputType'],
  ): string {
    switch (expected) {
      case 'audio':
        return "I'm expecting audio right now. Please send an audio file.";
      case 'image':
        return "I'm expecting an image right now. Please send a photo.";
      case 'text':
        return "I'm expecting text right now. Please send a message.";
      case 'video':
        return "I'm expecting video right now. Please send a video.";
      default:
        return "I'm not expecting a file right now. Send /workflows to start.";
    }
  }

  private collectInputValue(
    state: ConversationState,
    input: WorkflowInput,
    value: string,
  ): void {
    state.collectedInputs.set(input.nodeId, value);
    if (input.inputKey) {
      state.collectedInputs.set(input.inputKey, value);
    }
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

  private async downloadMediaFromTelegram(
    ctx: Context,
    payload: TelegramMediaPayload,
    chatId: number,
    nodeId: string,
    mediaType: TelegramMediaInputType,
  ): Promise<string> {
    if (!this.filesClientService) {
      throw new Error('File storage service is unavailable');
    }

    const file = await ctx.api.getFile(payload.fileId);

    // Telegram omits file_path for files larger than the 20 MB Bot API limit.
    if (!file.file_path) {
      await ctx.reply(
        '❌ This file is too large for the Telegram bot to download (limit: 20 MB). Please compress it or use a smaller file.',
      );
      throw new Error('Telegram file too large: file_path not returned by API');
    }

    const telegramFileUrl = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;

    const response = await fetch(telegramFileUrl);
    if (!response.ok) {
      throw new Error(`Telegram file download failed: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType =
      response.headers.get('content-type') ||
      payload.mimeType ||
      payload.defaultContentType;
    const ext =
      path.extname(file.file_path || '') ||
      path.extname(payload.fileName || '') ||
      payload.fallbackExtension;
    const key = `telegram-uploads/${chatId}-${nodeId}-${Date.now()}${ext}`;
    const uploadType = mediaType === 'audio' ? 'musics' : 'videos';

    const metadata = await this.filesClientService.uploadToS3(key, uploadType, {
      contentType,
      data: buffer,
      type: FileInputType.BUFFER,
    });

    if (!metadata.publicUrl) {
      throw new Error(`Re-hosted ${mediaType} did not return a public URL`);
    }

    return metadata.publicUrl;
  }
}
