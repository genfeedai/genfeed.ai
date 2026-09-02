import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CaptionsQueryDto } from '@api/collections/captions/dto/captions-query.dto';
import { CreateCaptionDto } from '@api/collections/captions/dto/create-caption.dto';
import { UpdateCaptionDto } from '@api/collections/captions/dto/update-caption.dto';
import { type CaptionDocument } from '@api/collections/captions/schemas/caption.schema';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { CaptionSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('captions')
export class CaptionsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly captionsService: CaptionsService,
    private readonly whisperService: WhisperService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: CaptionsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    // Build match conditions
    const matchConditions: Record<string, unknown> = {
      isDeleted: false,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    };

    // Add language filter if provided
    if (query.language) {
      matchConditions.language = query.language;
    }

    // Add format filter if provided
    if (query.format) {
      matchConditions.format = query.format;
    }

    const aggregate = { where: matchConditions, orderBy: { createdAt: -1 } };

    const data: AggregatePaginateResult<CaptionDocument> =
      await this.captionsService.findAll(aggregate, options);
    return serializeCollection(request, CaptionSerializer, data);
  }

  @Get(':captionId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('captionId') captionId: string,
  ): Promise<JsonApiSingleResponse> {
    const data: CaptionDocument | null = await this.captionsService.findOne(
      { id: captionId },
      [
        {
          path: 'ingredient',
          populate: {
            path: 'metadata',
          },
        },
      ],
    );

    return data
      ? serializeSingle(request, CaptionSerializer, data)
      : returnNotFound(this.constructorName, captionId);
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() createCaptionDto: CreateCaptionDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const ingredient: IngredientDocument | null =
      await this.ingredientsService.findOne(
        {
          id: createCaptionDto.ingredientId,
          isDeleted: false,
          organizationId: user.organizationId,
        },
        [{ path: 'metadata' }],
      );

    if (!ingredient) {
      return returnNotFound(
        this.constructorName,
        createCaptionDto.ingredientId,
      );
    }

    // Validate that the ingredient is a video
    const ingredientCategory = ingredient.category as IngredientCategory;
    if (ingredientCategory !== IngredientCategory.VIDEO) {
      this.loggerService.error(
        `Cannot generate captions for non-video ingredient.`,
        ingredient,
      );

      throw new BadRequestException(
        `Captions can only be generated for video ingredients. This ingredient is of type: ${ingredientCategory}`,
      );
    }

    // Validate that the video ingredient is ready (completed/uploaded status)
    const ingredientStatus = String(ingredient.status);
    if (
      ingredientStatus !== IngredientStatus.GENERATED &&
      ingredientStatus !== IngredientStatus.UPLOADED &&
      ingredientStatus !== IngredientStatus.VALIDATED
    ) {
      this.loggerService.error(
        `Cannot generate captions for video with status: ${ingredient.status}`,
        ingredient,
      );

      throw new BadRequestException(
        `Video must be completed or uploaded to generate captions. Current status: ${ingredient.status}`,
      );
    }

    this.loggerService.log(
      `Generating captions for video ingredient: ${ingredient.id}`,
    );

    const captionContent = await this.whisperService.generateCaptions(
      ingredient.id.toString(),
      {
        cdnUrl: ingredient.cdnUrl,
        metadata: ingredient.metadata,
        s3Key: ingredient.s3Key,
      },
    );

    const captionInput = {
      content: captionContent,
      format: createCaptionDto.format,
      ingredientId: createCaptionDto.ingredientId,
      isDeleted: false,
      language: createCaptionDto.language,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    };
    const data: CaptionDocument =
      await this.captionsService.create(captionInput);
    return serializeSingle(request, CaptionSerializer, data);
  }

  @Patch(':captionId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('captionId') captionId: string,
    @Body() updateCaptionDto: UpdateCaptionDto,
  ): Promise<JsonApiSingleResponse> {
    const data: CaptionDocument | null = await this.captionsService.patch(
      captionId,
      updateCaptionDto,
    );
    return data
      ? serializeSingle(request, CaptionSerializer, data)
      : returnNotFound(this.constructorName, captionId);
  }

  @Delete(':captionId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @Param('captionId') captionId: string,
  ): Promise<JsonApiSingleResponse> {
    const data: CaptionDocument | null =
      await this.captionsService.remove(captionId);
    return data
      ? serializeSingle(request, CaptionSerializer, data)
      : returnNotFound(this.constructorName, captionId);
  }
}
