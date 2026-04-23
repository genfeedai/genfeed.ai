import { CaptionsQueryDto } from '@api/collections/captions/dto/captions-query.dto';
import { CreateCaptionDto } from '@api/collections/captions/dto/create-caption.dto';
import { UpdateCaptionDto } from '@api/collections/captions/dto/update-caption.dto';
import { CaptionEntity } from '@api/collections/captions/entities/caption.entity';
import { type CaptionDocument } from '@api/collections/captions/schemas/caption.schema';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
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

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

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

    const publicMetadata = getPublicMetadata(user);

    // Build match conditions
    const matchConditions: Record<string, unknown> = {
      isDeleted: false,
      user: publicMetadata.user,
    };

    // Add language filter if provided
    if (query.language) {
      matchConditions.language = query.language;
    }

    // Add format filter if provided
    if (query.format) {
      matchConditions.format = query.format;
    }

    const aggregate: Record<string, unknown>[] = [
      {
        $match: matchConditions,
      },
      {
        $lookup: {
          as: 'ingredient',
          foreignField: '_id',
          from: 'ingredients',
          localField: 'ingredient',
        },
      },
      {
        $unwind: {
          path: '$ingredient',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Filter by brand if provided
      ...(query.brand && isValidObjectId(query.brand)
        ? [
            {
              $match: {
                'ingredient.brand': query.brand,
              },
            },
          ]
        : []),
      {
        $lookup: {
          as: 'ingredient.metadata',
          foreignField: '_id',
          from: 'metadata',
          localField: 'ingredient.metadata',
        },
      },
      {
        $unwind: {
          path: '$ingredient.metadata',
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { createdAt: -1 } },
    ];

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
      { _id: captionId },
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
    const publicMetadata = getPublicMetadata(user);

    const ingredient: IngredientDocument | null =
      await this.ingredientsService.findOne({
        _id: createCaptionDto.ingredient,
      });

    if (!ingredient) {
      return returnNotFound(
        this.constructorName,
        createCaptionDto.ingredient.toString(),
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
      `Generating captions for video ingredient: ${ingredient._id}`,
    );

    const captionContent = await this.whisperService.generateCaptions(
      ingredient._id.toString(),
    );

    const data: CaptionDocument = await this.captionsService.create(
      new CaptionEntity({
        ...createCaptionDto,
        content: captionContent,
        format: createCaptionDto.format,
        ingredient: createCaptionDto.ingredient,
        isDeleted: false,
        language: createCaptionDto.language,
        user: publicMetadata.user,
      }),
    );
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
      new CaptionEntity(updateCaptionDto),
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
