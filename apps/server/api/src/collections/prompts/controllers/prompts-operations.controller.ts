/**
 * Prompts Operations Controller
 * Handles voice transcription and tweet reply generation.
 */

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateTweetReplyDto } from '@api/collections/prompts/dto/create-tweet-reply.dto';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import {
  ActivitySource,
  AssetScope,
  ModelCategory,
  PromptCategory,
  PromptStatus,
  PromptTemplateKey,
  ReplyLength,
  ReplyTone,
  SystemPromptKey,
} from '@genfeedai/contracts';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Optional,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

interface UploadedBinaryFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@AutoSwagger()
@Controller('prompts')
@UseInterceptors(CreditsInterceptor)
@UseGuards(RolesGuard)
export class PromptsOperationsController {
  constructor(
    readonly loggerService: LoggerService,
    private readonly replicateService: ReplicateService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly promptsService: PromptsService,
    private readonly whisperService: WhisperService,
    @Optional() private readonly templatesService?: TemplatesService,
  ) {}

  @Post('voice-to-speech')
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 25 * 1024 * 1024,
      },
    }),
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async voiceToSpeech(
    @UploadedFile() file: UploadedBinaryFile,
  ): Promise<{ text: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.buffer || !file.originalname) {
      throw new BadRequestException('Invalid file data');
    }

    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 25MB limit');
    }

    const allowedMimeTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/webm',
      'audio/ogg',
    ];
    if (file.mimetype && !allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedMimeTypes.join(',')}`,
      );
    }

    const text = await this.whisperService.transcribeAudio(file);
    return { text };
  }

  @Post('tweet')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Tweet reply generation using AI',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.TWEET_REPLY,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateTweetReply(
    @Body() createTweetReplyDto: CreateTweetReplyDto,
    @CurrentUser() user: User,
  ): Promise<{
    reply: string;
    metadata?: {
      tone: ReplyTone;
      length: ReplyLength;
      tweetUrl?: string;
      timestamp: string;
    };
  }> {
    const tone = createTweetReplyDto.tone || ReplyTone.FRIENDLY;
    const length = createTweetReplyDto.length || ReplyLength.MEDIUM;

    if (!this.templatesService) {
      throw new Error('Template service not available');
    }

    const userPrompt = await this.templatesService.getRenderedPrompt(
      PromptTemplateKey.TWEET_REPLY,
      {
        context: createTweetReplyDto.context || '',
        customInstructions: createTweetReplyDto.customInstructions || '',
        length,
        tagGrok: createTweetReplyDto.tagGrok || false,
        tone,
        tweetAuthor: createTweetReplyDto.tweetAuthor || '',
        tweetContent: createTweetReplyDto.tweetContent,
      },
      user.organizationId,
    );

    try {
      const { input } = await this.promptBuilderService.buildPrompt(
        DEFAULT_MINI_TEXT_MODEL,
        {
          maxTokens: TEXT_GENERATION_LIMITS.tweetReply,
          modelCategory: ModelCategory.TEXT,
          prompt: userPrompt,
          promptTemplate: PromptTemplateKey.TEXT_TWEET_REPLY,
          systemPromptTemplate: SystemPromptKey.TWEET_REPLY,
          temperature: 0.8,
        },
        user.organizationId,
      );
      const result = await this.replicateService.generateTextCompletionSync(
        DEFAULT_MINI_TEXT_MODEL,
        input,
      );
      const promptEntity = new PromptEntity({
        category: 'tweet-reply' as unknown as PromptCategory,
        enhanced: result,
        organizationId: user.organizationId,
        original: createTweetReplyDto.tweetContent,
        scope: AssetScope.USER,
        status: PromptStatus.GENERATED,
        userId: user.userId ?? user.id,
      });

      await this.promptsService.create(promptEntity);

      const generatedReply = result.trim();
      const replyText = createTweetReplyDto.tagGrok
        ? `@grok ${generatedReply}`
        : generatedReply;

      return {
        metadata: {
          length,
          timestamp: new Date().toISOString(),
          tone,
          tweetUrl: createTweetReplyDto.tweetUrl,
        },
        reply: replyText,
      };
    } catch (error: unknown) {
      throw new BadRequestException(
        (error as Error)?.message || 'Failed to generate tweet reply',
      );
    }
  }
}
