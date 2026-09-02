import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ParsePromptDto } from '@api/collections/prompts/dto/parse-prompt.dto';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import type { PromptDocument } from '@api/collections/prompts/schemas/prompt.schema';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import {
  isCinematicPromptCategory,
  loadCinematicLexiconGuidance,
} from '@api/endpoints/ai-actions/prompts/cinematic-enhancement';
import { PromptParser } from '@api/helpers/utils/prompt-parser/prompt-parser.util';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import type { IPromptBrandContext } from '@api/shared/interfaces/prompt/prompt.interface';
import {
  ActivityKey,
  ActivitySource,
  ModelCategory,
  PromptStatus,
  PromptTemplateKey,
  Status,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import type { Request } from 'express';

const LEGACY_CONTROLLER_NAME = 'PromptsOperationsController';

type RequestWithCredits = Request & {
  creditsConfig?: { amount?: number };
};

function toPromptBrandContext(
  brand: BrandDocument | null | undefined,
): IPromptBrandContext | undefined {
  if (!brand) {
    return undefined;
  }

  return {
    backgroundColor: brand.backgroundColor ?? undefined,
    description: brand.description ?? undefined,
    label: brand.label ?? undefined,
    primaryColor: brand.primaryColor ?? undefined,
    secondaryColor: brand.secondaryColor ?? undefined,
    text: brand.text ?? undefined,
  };
}

@Injectable()
export class PromptTransformationService {
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
    @Optional() private readonly templatesService?: TemplatesService,
  ) {}

  async parse(
    dto: ParsePromptDto,
    user: User,
  ): Promise<{ normalizedType: string; promptString: string }> {
    let selectedBrand: BrandDocument | undefined;
    if (isEntityId(dto.brandId)) {
      const brand = await this.brandsService.findOne({
        id: dto.brandId,
        OR: [
          { userId: user.userId ?? user.id },
          { organizationId: user.organizationId },
        ],
      });
      selectedBrand = brand ?? undefined;
    }

    const { normalizedType, promptString } = PromptParser.parsePrompt(
      this.configService,
      {
        brand: toPromptBrandContext(selectedBrand),
        category: dto.category,
        originalPrompt: dto.original,
      },
    );

    return { normalizedType, promptString };
  }

  async createRemix(
    request: Request,
    promptId: string,
    user: User,
  ): Promise<PromptDocument> {
    const chargedCredits =
      (request as RequestWithCredits).creditsConfig?.amount ?? 0;
    const prompt = await this.findOwnedPrompt(promptId, user);
    const promptBrandId = isEntityId(prompt.brandId) ? prompt.brandId : null;
    const { normalizedType, promptString } =
      await this.parseStoredPrompt(prompt);
    const data = await this.promptsService.create(
      new PromptEntity({
        brandId: prompt.brandId,
        category: normalizedType,
        organizationId: prompt.organizationId,
        original: prompt.original,
        scope: prompt.scope,
        status: PromptStatus.PROCESSING,
        userId: prompt.userId,
      }),
    );
    const systemPromptKey =
      PromptParser.getSystemPromptTemplateKey(normalizedType);
    const userPrompt = await this.renderRemixPrompt(
      promptString,
      normalizedType,
      systemPromptKey,
      user.organizationId,
    );
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId: promptBrandId ?? user.brandId,
        key: ActivityKey.PROMPT_REMIX_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.PROMPT_REMIX,
        userId: user.userId ?? user.id,
        value: JSON.stringify({
          promptId: data.id.toString(),
          sourcePromptId: promptId,
          type: 'remix',
        }),
      }),
    );

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
      label: 'Prompt Remix',
      progress: 0,
      room: getUserRoomName(user.id),
      status: 'processing',
      taskId: data.id.toString(),
      userId: user.id,
    });

    this.generateRemix({
      activityId: activity.id.toString(),
      chargedCredits,
      data,
      organizationId: user.organizationId,
      promptId,
      systemPromptKey,
      userId: user.userId ?? user.id,
      userPrompt,
    }).catch((error: unknown) => {
      this.loggerService.error(
        `${LEGACY_CONTROLLER_NAME} postRemixResponse failed`,
        error,
      );
    });

    return data;
  }

  async enhanceExisting(
    promptId: string,
    user: User,
  ): Promise<PromptDocument | null> {
    const prompt = await this.findOwnedPrompt(promptId, user);
    const promptBrandId = isEntityId(prompt.brandId) ? prompt.brandId : null;
    const { normalizedType, promptString } =
      await this.parseStoredPrompt(prompt);
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId: promptBrandId ?? user.brandId,
        key: ActivityKey.PROMPT_ENHANCE_PROCESSING,
        organizationId: user.organizationId,
        source: ActivitySource.PROMPT_ENHANCEMENT,
        userId: user.userId ?? user.id,
        value: JSON.stringify({ promptId, type: 'enhance' }),
      }),
    );

    await this.websocketService.publishBackgroundTaskUpdate({
      activityId: activity.id.toString(),
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
      await this.verifySystemTemplate(
        systemPromptKey,
        normalizedType,
        user.organizationId,
      );
      const userPrompt = this.extractPromptText(promptString);
      const cinematicGuidance = isCinematicPromptCategory(normalizedType)
        ? loadCinematicLexiconGuidance()
        : '';
      const { input } = await this.promptBuilderService.buildPrompt(
        DEFAULT_MINI_TEXT_MODEL,
        {
          maxTokens: TEXT_GENERATION_LIMITS.promptEnhancement,
          modelCategory: ModelCategory.TEXT,
          prompt: userPrompt,
          promptTemplate: PromptTemplateKey.TEXT_ENHANCEMENT,
          systemPromptTemplate: systemPromptKey,
          ...(cinematicGuidance
            ? { systemPromptSuffix: cinematicGuidance }
            : {}),
          temperature: 0.8,
        },
        user.organizationId,
      );
      const result = await this.replicateService.generateTextCompletionSync(
        DEFAULT_MINI_TEXT_MODEL,
        input,
      );

      await this.promptsService.patch(promptId, {
        enhanced: result,
        status: PromptStatus.GENERATED,
      });
      await this.activitiesService.patch(activity.id.toString(), {
        key: ActivityKey.PROMPT_ENHANCE_COMPLETED,
        value: JSON.stringify({
          progress: 100,
          promptId,
          type: 'enhance',
        }),
      });

      return this.promptsService.findOne({ id: promptId });
    } catch (error: unknown) {
      await this.activitiesService.patch(activity.id.toString(), {
        key: ActivityKey.PROMPT_ENHANCE_FAILED,
        value: JSON.stringify({
          error: this.errorMessage(error),
          promptId,
          type: 'enhance',
        }),
      });
      await this.promptsService.patch(promptId, {
        status: PromptStatus.FAILED,
      });

      throw new BadRequestException(
        this.errorMessage(error, 'Failed to enhance prompt'),
      );
    }
  }

  private async findOwnedPrompt(
    promptId: string,
    user: User,
  ): Promise<PromptDocument> {
    const prompt = await this.promptsService.findOne({ id: promptId });

    if (!prompt || prompt.userId !== (user.userId ?? user.id)) {
      return returnNotFound(LEGACY_CONTROLLER_NAME, promptId);
    }

    return prompt;
  }

  private async parseStoredPrompt(prompt: PromptDocument) {
    const promptBrandId = isEntityId(prompt.brandId) ? prompt.brandId : null;
    const selectedBrand = promptBrandId
      ? ((await this.brandsService.findOne({ id: promptBrandId })) ?? undefined)
      : undefined;

    return PromptParser.parsePrompt(this.configService, {
      brand: toPromptBrandContext(selectedBrand),
      category: prompt.category ? String(prompt.category) : '',
      originalPrompt: prompt.original,
    });
  }

  private async renderRemixPrompt(
    promptString: string,
    normalizedType: string,
    systemPromptKey: string,
    organizationId: string,
  ): Promise<string> {
    if (!this.templatesService) {
      return this.extractPromptText(promptString);
    }

    try {
      await this.templatesService.getRenderedPrompt(
        systemPromptKey,
        {},
        organizationId,
      );
      return await this.templatesService.getRenderedPrompt(
        PromptTemplateKey.REMIX,
        { category: normalizedType, promptString },
        organizationId,
      );
    } catch (error: unknown) {
      this.loggerService.warn('Template not found, using fallback', {
        category: normalizedType,
        error,
        key: systemPromptKey,
      });
      return this.extractPromptText(promptString);
    }
  }

  private async verifySystemTemplate(
    systemPromptKey: string,
    normalizedType: string,
    organizationId: string,
  ): Promise<void> {
    if (!this.templatesService) {
      return;
    }

    try {
      await this.templatesService.getRenderedPrompt(
        systemPromptKey,
        {},
        organizationId,
      );
    } catch (error: unknown) {
      this.loggerService.warn('Template not found, using fallback', {
        category: normalizedType,
        error,
        key: systemPromptKey,
      });
    }
  }

  private extractPromptText(promptString: string): string {
    try {
      const prompt = JSON.parse(promptString) as { prompt?: string };
      return prompt.prompt || promptString;
    } catch {
      return promptString;
    }
  }

  private async generateRemix(options: {
    activityId: string;
    chargedCredits: number;
    data: PromptDocument;
    organizationId: string;
    promptId: string;
    systemPromptKey: string;
    userId: string;
    userPrompt: string;
  }): Promise<void> {
    const {
      activityId,
      chargedCredits,
      data,
      organizationId,
      promptId,
      systemPromptKey,
      userId,
      userPrompt,
    } = options;
    const url = `${LEGACY_CONTROLLER_NAME} postRemixResponse`;

    try {
      const { input } = await this.promptBuilderService.buildPrompt(
        DEFAULT_MINI_TEXT_MODEL,
        {
          maxTokens: TEXT_GENERATION_LIMITS.promptRemix,
          modelCategory: ModelCategory.TEXT,
          prompt: userPrompt,
          promptTemplate: PromptTemplateKey.TEXT_ENHANCEMENT,
          systemPromptTemplate: systemPromptKey,
          temperature: 0.8,
        },
        organizationId,
      );
      const result = await this.replicateService.generateTextCompletionSync(
        DEFAULT_MINI_TEXT_MODEL,
        input,
      );

      this.loggerService.log(`${url} succeeded`, { result });
      await this.promptsService.patch(data.id, {
        enhanced: result,
        status: PromptStatus.GENERATED,
      });
      await this.activitiesService.patch(activityId, {
        key: ActivityKey.PROMPT_REMIX_COMPLETED,
        value: JSON.stringify({
          progress: 100,
          promptId: data.id.toString(),
          sourcePromptId: promptId,
          type: 'remix',
        }),
      });
      await this.websocketService.emit(WebSocketPaths.prompt(data.id), {
        result,
        status: Status.COMPLETED,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      await this.activitiesService.patch(activityId, {
        key: ActivityKey.PROMPT_REMIX_FAILED,
        value: JSON.stringify({
          error: this.errorMessage(error),
          promptId: data.id.toString(),
          sourcePromptId: promptId,
          type: 'remix',
        }),
      });
      await this.refundRemixCredits(organizationId, userId, chargedCredits);
      await this.promptsService.patch(data.id, {
        status: PromptStatus.FAILED,
      });
      await this.websocketService.emit(WebSocketPaths.prompt(data.id), {
        error: this.errorMessage(error),
        status: Status.FAILED,
      });
    }
  }

  private async refundRemixCredits(
    organizationId: string,
    userId: string,
    chargedCredits: number,
  ): Promise<void> {
    try {
      const refundExpiresAt = new Date();
      refundExpiresAt.setFullYear(refundExpiresAt.getFullYear() + 1);
      await this.creditsUtilsService.refundOrganizationCredits(
        organizationId,
        chargedCredits,
        'prompt-remix-refund',
        'Remix prompt generation failed - credit refund',
        refundExpiresAt,
      );
      this.loggerService.log('Credits refunded successfully', {
        amount: chargedCredits,
        organizationId,
        userId,
      });
    } catch (error: unknown) {
      this.loggerService.error('Failed to refund credits', {
        error,
        organizationId,
        userId,
      });
    }
  }

  private errorMessage(error: unknown, fallback = 'An error occurred'): string {
    if (typeof error !== 'object' || error === null || !('message' in error)) {
      return fallback;
    }

    return typeof error.message === 'string' && error.message
      ? error.message
      : fallback;
  }
}
