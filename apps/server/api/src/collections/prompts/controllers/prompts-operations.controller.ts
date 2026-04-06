/**
 * Prompts Operations Controller
 * Handles prompt operation routes:
 * - Parse prompts
 * - Generate remix prompts
 * - Enhance prompts
 * - Voice to speech conversion
 * - Generate tweet replies
 */
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { Brand } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateTweetReplyDto } from '@api/collections/prompts/dto/create-tweet-reply.dto';
import { ParsePromptDto } from '@api/collections/prompts/dto/parse-prompt.dto';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ConfigService } from '@api/config/config.service';
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
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { PromptParser } from '@api/helpers/utils/prompt-parser/prompt-parser.util';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import type { User } from '@clerk/backend';
import { PromptSerializer } from '@genfeedai/serializers';
import {
  ActivityKey,
  ActivitySource,
  AssetScope,
  ModelCategory,
  PromptCategory,
  PromptStatus,
  PromptTemplateKey,
  ReplyLength,
  ReplyTone,
  Status,
  SystemPromptKey,
} from '@genfeedai/enums';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import {
  BadRequestException,
  Body,
  Controller,
  Optional,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { isValidObjectId, Types } from 'mongoose';

@AutoSwagger()
@Controller('prompts')
@UseInterceptors(CreditsInterceptor)
@UseGuards(RolesGuard)
export class PromptsOperationsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly brandsService: BrandsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly loggerService: LoggerService,
    private readonly replicateService: ReplicateService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly promptsService: PromptsService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly whisperService: WhisperService,
    @Optional() private readonly templatesService?: TemplatesService,
  ) {}

  @Post('parse')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async parse(
    @Body() createParsePromptDto: ParsePromptDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);

    let selectedBrand: Brand | undefined;
    if (isValidObjectId(createParsePromptDto.brand)) {
      const brand = await this.brandsService.findOne({
        _id: new Types.ObjectId(createParsePromptDto.brand),
        $or: [
          { user: new Types.ObjectId(publicMetadata.user) },
          { organization: new Types.ObjectId(publicMetadata.organization) },
        ],
        isDeleted: false,
      });
      selectedBrand = brand ?? undefined;
    }

    const { promptString, normalizedType } = PromptParser.parsePrompt(
      this.configService,
      {
        brand: selectedBrand,
        category: createParsePromptDto.category,
        originalPrompt: createParsePromptDto.original,
      },
    );

    return { normalizedType, promptString };
  }

  @Post(':promptId/remix')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Remix prompt generation using AI',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.PROMPT_REMIX,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createRemix(
    @Req() request: Request,
    @Param('promptId') promptId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const chargedCredits =
      (
        request as Request & {
          creditsConfig?: { amount?: number };
        }
      ).creditsConfig?.amount ?? 0;
    const prompt = await this.promptsService.findOne({
      _id: promptId,
      isDeleted: false,
    });

    if (!prompt || String(prompt.user) !== publicMetadata.user) {
      return returnNotFound(this.constructorName, promptId);
    }

    let selectedBrand: Brand | undefined;
    if (isValidObjectId(prompt.brand)) {
      const brand = await this.brandsService.findOne({
        _id: new Types.ObjectId(prompt.brand),
        isDeleted: false,
      });
      selectedBrand = brand ?? undefined;
    }

    const { promptString, normalizedType } = PromptParser.parsePrompt(
      this.configService,
      {
        brand: selectedBrand,
        category: prompt.category ? String(prompt.category) : '',
        originalPrompt: prompt.original,
      },
    );

    const data = await this.promptsService.create(
      new PromptEntity({
        brand: prompt.brand,
        category: normalizedType,
        organization: prompt.organization,
        original: prompt.original,
        scope: prompt?.scope,
        status: PromptStatus.PROCESSING,
        user: prompt.user,
      }),
    );

    const url = `${this.constructorName} postRemixResponse`;

    let userPrompt: string;
    const systemPromptKey =
      PromptParser.getSystemPromptTemplateKey(normalizedType);

    if (this.templatesService) {
      try {
        await this.templatesService.getRenderedPrompt(
          systemPromptKey,
          {},
          publicMetadata.organization,
        );
        userPrompt = await this.templatesService.getRenderedPrompt(
          PromptTemplateKey.REMIX,
          {
            category: normalizedType,
            promptString,
          },
          publicMetadata.organization,
        );
      } catch (error) {
        this.loggerService.warn('Template not found, using fallback', {
          category: normalizedType,
          error,
          key: systemPromptKey,
        });

        try {
          const promptObj = JSON.parse(promptString);
          userPrompt = promptObj.prompt || promptString;
        } catch {
          userPrompt = promptString;
        }
      }
    } else {
      try {
        const promptObj = JSON.parse(promptString);
        userPrompt = promptObj.prompt || promptString;
      } catch {
        userPrompt = promptString;
      }
    }

    // Create activity for prompt remix start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: isValidObjectId(prompt.brand)
          ? new Types.ObjectId(prompt.brand)
          : new Types.ObjectId(publicMetadata.brand),
        key: ActivityKey.PROMPT_REMIX_PROCESSING,
        organization: new Types.ObjectId(publicMetadata.organization),
        source: ActivitySource.PROMPT_REMIX,
        user: new Types.ObjectId(publicMetadata.user),
        value: JSON.stringify({
          promptId: data._id.toString(),
          sourcePromptId: promptId,
          type: 'remix',
        }),
      }),
    );

    // Emit background-task-update WebSocket event for activities dropdown
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity._id.toString(),
      label: 'Prompt Remix',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: data._id.toString(),
      userId: user.id,
    });

    this.promptBuilderService
      .buildPrompt(
        DEFAULT_MINI_TEXT_MODEL,
        {
          maxTokens: TEXT_GENERATION_LIMITS.promptRemix,
          modelCategory: ModelCategory.TEXT,
          prompt: userPrompt,
          promptTemplate: PromptTemplateKey.TEXT_ENHANCEMENT,
          systemPromptTemplate: systemPromptKey,
          temperature: 0.8,
        },
        publicMetadata.organization,
      )
      .then(({ input }) =>
        this.replicateService.generateTextCompletionSync(
          DEFAULT_MINI_TEXT_MODEL,
          input,
        ),
      )
      .then(async (result) => {
        this.loggerService.log(`${url} succeeded`, { result });

        await this.promptsService.patch(data._id, {
          enhanced: result,
          status: PromptStatus.GENERATED,
        });

        // Update activity to completed
        await this.activitiesService.patch(activity._id.toString(), {
          key: ActivityKey.PROMPT_REMIX_COMPLETED,
          value: JSON.stringify({
            progress: 100,
            promptId: data._id.toString(),
            sourcePromptId: promptId,
            type: 'remix',
          }),
        });

        await this.websocketService.emit(WebSocketPaths.prompt(data._id), {
          result,
          status: Status.COMPLETED,
        });

        return result;
      })
      .catch(async (error: unknown) => {
        this.loggerService.error(`${url} failed`, error);

        // Update activity to failed
        await this.activitiesService.patch(activity._id.toString(), {
          key: ActivityKey.PROMPT_REMIX_FAILED,
          value: JSON.stringify({
            error: (error as Error)?.message || 'An error occurred',
            promptId: data._id.toString(),
            sourcePromptId: promptId,
            type: 'remix',
          }),
        });

        // Refund credits since AI call failed
        try {
          const refundExpiresAt = new Date();
          refundExpiresAt.setFullYear(refundExpiresAt.getFullYear() + 1); // Expire in 1 year

          await this.creditsUtilsService.refundOrganizationCredits(
            publicMetadata.organization,
            chargedCredits,
            'prompt-remix-refund',
            'Remix prompt generation failed - credit refund',
            refundExpiresAt,
          );

          this.loggerService.log('Credits refunded successfully', {
            amount: chargedCredits,
            organizationId: publicMetadata.organization,
            userId: publicMetadata.user,
          });
        } catch (refundError: unknown) {
          this.loggerService.error('Failed to refund credits', {
            error: refundError,
            organizationId: publicMetadata.organization,
            userId: publicMetadata.user,
          });
        }

        await this.promptsService.patch(data._id, {
          status: PromptStatus.FAILED,
        });

        await this.websocketService.emit(WebSocketPaths.prompt(data._id), {
          error: (error as Error)?.message || 'An error occurred',
          status: Status.FAILED,
        });
      });

    return serializeSingle(request, PromptSerializer, data);
  }

  @Post(':promptId/enhance')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Prompt enhancement using AI',
    modelKey: DEFAULT_MINI_TEXT_MODEL,
    source: ActivitySource.PROMPT_ENHANCEMENT,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async enhanceExisting(
    @Req() request: Request,
    @Param('promptId') promptId: string,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const prompt = await this.promptsService.findOne({
      _id: promptId,
      isDeleted: false,
    });

    if (!prompt || String(prompt.user) !== publicMetadata.user) {
      return returnNotFound(this.constructorName, promptId);
    }

    let selectedBrand: Brand | undefined;
    if (isValidObjectId(prompt.brand)) {
      const brand = await this.brandsService.findOne({
        _id: new Types.ObjectId(prompt.brand),
        isDeleted: false,
      });
      selectedBrand = brand ?? undefined;
    }

    const { promptString, normalizedType } = PromptParser.parsePrompt(
      this.configService,
      {
        brand: selectedBrand,
        category: prompt.category ? String(prompt.category) : '',
        originalPrompt: prompt.original,
      },
    );

    // Create activity for prompt enhance start
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brand: isValidObjectId(prompt.brand)
          ? new Types.ObjectId(prompt.brand)
          : new Types.ObjectId(publicMetadata.brand),
        key: ActivityKey.PROMPT_ENHANCE_PROCESSING,
        organization: new Types.ObjectId(publicMetadata.organization),
        source: ActivitySource.PROMPT_ENHANCEMENT,
        user: new Types.ObjectId(publicMetadata.user),
        value: JSON.stringify({
          promptId: promptId,
          type: 'enhance',
        }),
      }),
    );

    // Emit background-task-update WebSocket event for activities dropdown
    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity._id.toString(),
      label: 'Prompt Enhance',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: promptId,
      userId: user.id,
    });

    try {
      const systemPromptKey =
        PromptParser.getSystemPromptTemplateKey(normalizedType);
      if (this.templatesService) {
        try {
          await this.templatesService.getRenderedPrompt(
            systemPromptKey,
            {},
            publicMetadata.organization,
          );
        } catch (error) {
          this.loggerService.warn('Template not found, using fallback', {
            category: normalizedType,
            error,
            key: systemPromptKey,
          });
        }
      }

      let userPrompt: string;
      try {
        const promptObj = JSON.parse(promptString);
        userPrompt = promptObj.prompt || promptString;
      } catch {
        userPrompt = promptString;
      }

      const { input } = await this.promptBuilderService.buildPrompt(
        DEFAULT_MINI_TEXT_MODEL,
        {
          maxTokens: TEXT_GENERATION_LIMITS.promptEnhancement,
          modelCategory: ModelCategory.TEXT,
          prompt: userPrompt,
          promptTemplate: PromptTemplateKey.TEXT_ENHANCEMENT,
          systemPromptTemplate: systemPromptKey,
          temperature: 0.8,
        },
        publicMetadata.organization,
      );

      const result = await this.replicateService.generateTextCompletionSync(
        DEFAULT_MINI_TEXT_MODEL,
        input,
      );

      await this.promptsService.patch(promptId, {
        enhanced: result,
        status: PromptStatus.GENERATED,
      });

      // Update activity to completed
      await this.activitiesService.patch(activity._id.toString(), {
        key: ActivityKey.PROMPT_ENHANCE_COMPLETED,
        value: JSON.stringify({
          progress: 100,
          promptId: promptId,
          type: 'enhance',
        }),
      });

      const updatedPrompt = await this.promptsService.findOne({
        _id: promptId,
        isDeleted: false,
      });
      return serializeSingle(request, PromptSerializer, updatedPrompt);
    } catch (error: unknown) {
      // Update activity to failed
      await this.activitiesService.patch(activity._id.toString(), {
        key: ActivityKey.PROMPT_ENHANCE_FAILED,
        value: JSON.stringify({
          error: (error as Error)?.message || 'An error occurred',
          promptId: promptId,
          type: 'enhance',
        }),
      });

      await this.promptsService.patch(promptId, {
        status: PromptStatus.FAILED,
      });

      throw new BadRequestException(
        (error as Error)?.message || 'Failed to enhance prompt',
      );
    }
  }

  @Post('voice-to-speech')
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 25 * 1024 * 1024, // 25MB max for voice files
      },
    }),
  )
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async voiceToSpeech(
    @UploadedFile() file: Express.Multer.File,
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
    const publicMetadata = getPublicMetadata(user);

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
      publicMetadata.organization,
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
        publicMetadata.organization,
      );

      const result = await this.replicateService.generateTextCompletionSync(
        DEFAULT_MINI_TEXT_MODEL,
        input,
      );

      // Store the prompt in the database for tracking
      const promptEntity = new PromptEntity({
        category: 'tweet-reply' as unknown as PromptCategory,
        enhanced: result,
        organization: new Types.ObjectId(publicMetadata.organization),
        original: createTweetReplyDto.tweetContent,
        scope: AssetScope.USER,
        status: PromptStatus.GENERATED,
        user: new Types.ObjectId(publicMetadata.user),
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
