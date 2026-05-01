import { type BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';
import { PromptQueryDto } from '@api/collections/prompts/dto/prompt-query.dto';
import { UpdatePromptDto } from '@api/collections/prompts/dto/update-prompt.dto';
import { type PromptDocument } from '@api/collections/prompts/schemas/prompt.schema';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ConfigService } from '@api/config/config.service';
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
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { PromptParser } from '@api/helpers/utils/prompt-parser/prompt-parser.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { IPromptBrandContext } from '@api/shared/interfaces/prompt/prompt.interface';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import {
  ActivitySource,
  PromptStatus,
  Status,
  SystemPromptKey,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { PromptSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

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

function toMarketplacePromptText(prompt: PromptDocument): string {
  return prompt.enhanced?.trim() || prompt.original.trim() || 'Untitled Prompt';
}

function toMarketplacePromptTitle(prompt: PromptDocument): string {
  const promptText = toMarketplacePromptText(prompt);

  return promptText.length > 80 ? `${promptText.slice(0, 77)}...` : promptText;
}

const PROMPT_ENHANCEMENT_MODEL = 'openrouter/free';
const DEFAULT_TEXT_SYSTEM_PROMPT =
  'You are an expert AI assistant. Follow the instructions carefully and provide high-quality responses.';

@AutoSwagger()
@Controller('prompts')
@UseInterceptors(CreditsInterceptor)
@UseGuards(RolesGuard)
export class PromptsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,

    private readonly brandsService: BrandsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly promptsService: PromptsService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly openRouterService: OpenRouterService,
    private readonly websocketService: NotificationsPublisherService,
    @Optional() readonly _templatesService?: TemplatesService,
    @Optional()
    private readonly marketplaceApiClient?: MarketplaceApiClient,
  ) {}

  @Post()
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    amount: 1,
    description: 'Prompt creation and enhancement using OpenRouter free',
    source: ActivitySource.PROMPT_CREATION,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() createPromptDto: CreatePromptDto,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const chargedCredits =
      (
        request as Request & {
          creditsConfig?: { amount?: number };
        }
      ).creditsConfig?.amount ?? 0;

    let selectedBrand: BrandDocument | undefined;
    if (isValidObjectId(createPromptDto.brand)) {
      const brand = await this.brandsService.findOne({
        _id: createPromptDto.brand,
        isDeleted: false,
        organization: publicMetadata.organization,
      });
      selectedBrand = brand ?? undefined;
    }

    const { normalizedType } = PromptParser.parsePrompt(this.configService, {
      brand: toPromptBrandContext(selectedBrand),
      category: createPromptDto.category,
      originalPrompt: createPromptDto.original,
    });

    const enrichedDto = {
      ...createPromptDto,
      brand: isValidObjectId(createPromptDto.brand)
        ? createPromptDto.brand
        : undefined,
      category: normalizedType,
      organization: publicMetadata.organization,
      status: PromptStatus.PROCESSING,
      user: publicMetadata.user,
    } as CreatePromptDto & { user: string };

    const data = await this.promptsService.create(enrichedDto, [
      { path: 'ingredient' },
    ]);

    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // User prompt is the original content
    const userPrompt = createPromptDto.original;

    // Derive system prompt key from model if provided
    // Priority: 1) model-specific template, 2) explicit systemPromptKey, 3) default
    let systemPromptKey: string = SystemPromptKey.DEFAULT;
    if (createPromptDto.model) {
      // Use existing utility to convert model key to template key
      // e.g., 'black-forest-labs/flux-2-pro' -> 'system.model.flux-2-pro'
      systemPromptKey = PromptParser.getModelSystemPromptTemplateKey(
        createPromptDto.model,
      );
    } else if (createPromptDto.systemPromptKey) {
      systemPromptKey = createPromptDto.systemPromptKey;
    }

    const systemPromptPromise = this._templatesService
      ? this._templatesService
          .getRenderedPrompt(systemPromptKey, {}, publicMetadata.organization)
          .catch(() => DEFAULT_TEXT_SYSTEM_PROMPT)
      : Promise.resolve(DEFAULT_TEXT_SYSTEM_PROMPT);

    systemPromptPromise
      .then((systemPrompt) =>
        this.openRouterService.chatCompletion({
          max_tokens: TEXT_GENERATION_LIMITS.promptEnhancement,
          messages: [
            { content: systemPrompt, role: 'system' },
            { content: userPrompt, role: 'user' },
          ],
          model: PROMPT_ENHANCEMENT_MODEL,
          temperature: 0.8,
        }),
      )
      .then((response) => response.choices[0]?.message?.content?.trim() ?? '')
      .then(async (result) => {
        this.loggerService.log(`${url} succeeded`, { result });

        await this.promptsService.patch(data._id, {
          enhanced: result,
          status: PromptStatus.GENERATED,
        });

        await this.websocketService.emit(WebSocketPaths.prompt(data._id), {
          result,
          status: Status.COMPLETED,
        });
      })
      .catch(async (error: unknown) => {
        this.loggerService.error(`${url} failed`, error);

        // Refund credits since AI call failed
        try {
          const refundExpiresAt = new Date();
          refundExpiresAt.setFullYear(refundExpiresAt.getFullYear() + 1); // Expire in 1 year

          await this.creditsUtilsService.refundOrganizationCredits(
            publicMetadata.organization,
            chargedCredits,
            'prompt-creation-refund',
            'Prompt creation failed - credit refund',
            refundExpiresAt,
          );

          this.loggerService.log('Credits refunded successfully', {
            amount: chargedCredits,
            organizationId: publicMetadata.organization,
            userId: publicMetadata.user,
          });
        } catch (error: unknown) {
          this.loggerService.error('Failed to refund credits', {
            error,
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

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PromptQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const scope = query.scope || { not: null };

    // Build match conditions
    const match: Record<string, unknown> = {
      isDeleted,
      scope,
      user: publicMetadata.user,
    };

    // Add brand filter if provided
    if (query.brand && isValidObjectId(query.brand)) {
      match.brand = query.brand;
    }

    // Filter by favorite status if provided
    if (typeof query.isFavorite === 'boolean') {
      match.isFavorite = query.isFavorite;
    }

    const aggregate = { where: match, orderBy: handleQuerySort(query.sort) };

    const data: AggregatePaginateResult<PromptDocument> =
      await this.promptsService.findAll(aggregate, options);
    return serializeCollection(request, PromptSerializer, data);
  }

  @Get(':promptId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('promptId') promptId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const data = (await this.promptsService.findOne(
      {
        _id: promptId,
        isDeleted: false,
        organization: publicMetadata.organization,
      },
      [{ path: 'ingredient' }],
    )) as unknown as PromptDocument | null;

    let prompt = data;

    // If prompt exists but has no ingredient, check if any ingredient references this prompt
    if (data && !data.ingredient) {
      const ingredient = await this.ingredientsService.findOne({
        isDeleted: false,
        organization: publicMetadata.organization,
        prompt: promptId,
      });

      if (ingredient) {
        prompt = { ...data, ingredient } as unknown as PromptDocument;
      }
    }

    return prompt
      ? serializeSingle(request, PromptSerializer, prompt)
      : returnNotFound(this.constructorName, promptId);
  }

  @Patch(':promptId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('promptId') promptId: string,
    @Body() updatePromptDto: UpdatePromptDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Verify the prompt exists and belongs to the user
    const prompt = await this.promptsService.findOne({
      _id: promptId,
      OR: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
      ],
      isDeleted: false,
    });

    if (!prompt) {
      return returnNotFound(this.constructorName, promptId);
    }

    await this.promptsService.patch(promptId, updatePromptDto);

    // Fetch the updated prompt with populated ingredient
    const data = await this.promptsService.findOne({ _id: promptId }, [
      { path: 'ingredient' },
    ]);

    return data
      ? serializeSingle(request, PromptSerializer, data)
      : returnNotFound(this.constructorName, promptId);
  }

  @Post(':promptId/publish')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async publishToMarketplace(
    @Param('promptId') promptId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const prompt = await this.promptsService.findOne({
      _id: promptId,
      isDeleted: false,
      user: publicMetadata.user,
    });

    if (!prompt) {
      return returnNotFound(this.constructorName, promptId);
    }

    if (!this.marketplaceApiClient) {
      return {
        data: {
          attributes: { message: 'Marketplace services not available' },
          id: promptId,
          type: 'error',
        },
      };
    }

    const seller = await this.marketplaceApiClient.getSellerByUserId(
      publicMetadata.user,
    );

    if (!seller) {
      return {
        data: {
          attributes: { message: 'Create a seller profile first' },
          id: promptId,
          type: 'error',
        },
      };
    }

    const promptText = toMarketplacePromptText(prompt);
    const promptTitle = toMarketplacePromptTitle(prompt);
    const promptTemplate = prompt.enhanced?.trim() || prompt.original;

    const listing = await this.marketplaceApiClient.createListing(
      seller._id.toString(),
      publicMetadata.organization,
      {
        description: promptText,
        downloadData: {
          category: prompt.category ?? undefined,
          original: prompt.original,
          promptId: prompt._id,
          template: promptTemplate,
          title: promptTitle,
          variables: [],
        },
        previewData: {
          category: prompt.category ?? undefined,
          template: promptTemplate.slice(0, 200),
          variableCount: 0,
        },
        price: 0,
        shortDescription: promptText.slice(0, 300),
        tags: ['community', 'prompt'],
        title: promptTitle,
        type: 'prompt',
      },
    );

    if (!listing) {
      return {
        data: {
          attributes: { message: 'Failed to create marketplace listing' },
          id: promptId,
          type: 'error',
        },
      };
    }

    // Auto-approve
    await this.marketplaceApiClient.submitForReview(
      listing._id.toString(),
      seller._id.toString(),
    );

    return {
      data: {
        attributes: {
          listingId: listing._id.toString(),
          message: 'Published to marketplace',
          promptId,
        },
        id: promptId,
        type: 'prompt-publish',
      },
    };
  }
}
