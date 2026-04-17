import { AvatarsService } from '@api/collections/avatars/services/avatars.service';
import { CreateAvatarDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { Credits } from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { HedraService } from '@api/services/integrations/hedra/services/hedra.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import { ActivitySource } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { AvatarSerializer, IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

type HeyGenVoice = Awaited<ReturnType<HeyGenService['getVoices']>>[number];
type HeyGenAvatar = Awaited<ReturnType<HeyGenService['getAvatars']>>[number];
type HedraVoice = Awaited<ReturnType<HedraService['getVoices']>>[number];
type HedraAvatar = Awaited<ReturnType<HedraService['getAvatars']>>[number];
type ElevenLabsVoice = Awaited<
  ReturnType<ElevenLabsService['getVoices']>
>[number];

interface ProviderVoicesAttributes<TVoice> {
  voices: TVoice[];
  provider: 'heygen' | 'hedra' | 'elevenlabs';
}

interface ProviderAvatarsAttributes<TAvatar> {
  avatars: TAvatar[];
  provider: 'heygen' | 'hedra';
}

@AutoSwagger()
@Controller('avatars')
export class AvatarsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly heygenService: HeyGenService,
    private readonly hedraService: HedraService,
    private readonly elevenlabsService: ElevenLabsService,
    private readonly avatarsService: AvatarsService,
  ) {}

  // Get HeyGen voices
  @Get('heygen/voices')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getHeygenVoices(
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse<ProviderVoicesAttributes<HeyGenVoice>>> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const voices = await this.heygenService.getVoices(
        publicMetadata.organization,
      );

      return {
        data: {
          attributes: {
            provider: 'heygen',
            voices,
          },
          id: 'heygen',
          type: 'voice-provider',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} ${CallerUtil.getCallerName()} failed`,
        error,
      );

      throw new HttpException(
        'Failed to fetch HeyGen voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Get HeyGen avatars list
  @Get('heygen/avatars')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getHeygenAvatars(
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse<ProviderAvatarsAttributes<HeyGenAvatar>>> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const avatars = await this.heygenService.getAvatars(
        publicMetadata.organization,
      );

      return {
        data: {
          attributes: {
            avatars,
            provider: 'heygen',
          },
          id: 'heygen',
          type: 'avatar-provider',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} ${CallerUtil.getCallerName()} failed`,
        error,
      );

      throw new HttpException(
        'Failed to fetch HeyGen avatars',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Get Hedra voices
  @Get('hedra/voices')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getHedraVoices(
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse<ProviderVoicesAttributes<HedraVoice>>> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const voices = await this.hedraService.getVoices(
        publicMetadata.organization,
      );

      return {
        data: {
          attributes: {
            provider: 'hedra',
            voices,
          },
          id: 'hedra',
          type: 'voice-provider',
        },
      };
    } catch (_error: unknown) {
      throw new HttpException(
        'Failed to fetch Hedra voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Get ElevenLabs voices
  @Get('elevenlabs/voices')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getElevenlabsVoices(
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse<ProviderVoicesAttributes<ElevenLabsVoice>>> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const voices = await this.elevenlabsService.getVoices(
        publicMetadata.organization,
      );

      return {
        data: {
          attributes: {
            provider: 'elevenlabs',
            voices,
          },
          id: 'elevenlabs',
          type: 'voice-provider',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} ${CallerUtil.getCallerName()} failed`,
        error,
      );

      throw new HttpException(
        'Failed to fetch ElevenLabs voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Get Hedra avatars
  @Get('hedra/avatars')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getHedraAvatars(
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse<ProviderAvatarsAttributes<HedraAvatar>>> {
    try {
      const publicMetadata = getPublicMetadata(user);
      const avatars = await this.hedraService.getAvatars(
        publicMetadata.organization,
      );

      return {
        data: {
          attributes: {
            avatars,
            provider: 'hedra',
          },
          id: 'hedra',
          type: 'avatar-provider',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} ${CallerUtil.getCallerName()} failed`,
        error,
      );

      throw new HttpException(
        'Failed to fetch Hedra avatars',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
          type: 'avatar',
          user: publicMetadata.user,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.avatarsService.findAll(aggregate, options);
    return serializeCollection(request, AvatarSerializer, data);
  }

  // Create a new avatar in HeyGen
  @Post('new')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  createNewAvatar(
    @Req() request: Request,
    // @Body() createAvatarDto: CreateAvatarDto,
    // @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    // const isAvatar = createIngredientDto.category === IngredientCategory.AVATAR;

    // if (!isAvatar) {
    //   throw new HttpException(
    //     {
    //       title: 'Validation failed',
    //       detail: 'Invalid avatar type',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }

    // const reference = await this.avatarsService.findOne(
    //   { _id: createIngredientDto.reference || createIngredientDto.avatar },
    //   [],
    // );

    // if (!reference) {
    //   return returnNotFound('Reference', script.reference );
    // }

    // This is generating a new JPG for the avat in mp4 later on
    // const { metadataData, ingredientData } =
    //   await this.sharedService.saveDocuments(user, {
    //     ...body,
    //     extension: 'jpeg',
    //     status: IngredientStatus.PROCESSING,
    //   });

    // const websocketUrl = `/avatars/${ingredientData._id}`;
    // const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // try {
    //   const avatarId = await this.heygenService.createAvatar(
    //     metadataData.label,
    //     `${this.configService.ingredientsEndpoint}/${reference.type}s/${reference._id}`,
    //   );

    //   if (avatarId) {
    //     await this.metadataService.patch(
    //       metadataData._id,
    //       new MetadataEntity({ externalId: avatarId }),
    //     );

    //     await this.avatarService.patch(ingredientData._id, { status: 'completed' });

    //     this.socketGateaway.emit(websocketUrl, {
    //       status: 'success',
    //       result: ingredientData._id,
    //     });
    //   } else {
    //     await this.avatarService.patch(ingredientData._id, { status: 'failed' });

    // await this.handleFailedGeneration(ingredientData._id, websocketUrl);
    //   }
    // } catch (error: unknown) {
    //   this.loggerService.error(`${url} failed`, error);

    // await this.handleFailedGeneration(ingredientData._id, websocketUrl);
    // }

    // return IngredientSerializer.serialize(ingredientData);
    return serializeSingle(request, IngredientSerializer, {});
  }

  // Generate a new avatar video in HeyGen
  @Post('generate')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    amount: 10,
    description: 'Avatar generation',
    source: ActivitySource.AVATAR_GENERATION,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  createGenerateAvatar(
    @Req() request: Request,
    @Body() createAvatarDto: CreateAvatarDto,
    @CurrentUser() user: User,
  ): JsonApiSingleResponse {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { createAvatarDto, user });

    // const isAvatar = createAvatarDto.category === IngredientCategory.AVATAR;
    // if (!isAvatar) {
    //   throw new HttpException(
    //     {
    //       title: 'Validation failed',
    //       detail: 'Invalid avatar type',
    //     },
    //     HttpStatus.BAD_REQUEST,
    //   );
    // }

    // const { metadataData, ingredientData } =
    //   await this.sharedService.saveDocuments(user, {
    //     ...createAvatarDto,
    //     extension: MetadataExtension.MP4,
    //     status: IngredientStatus.PROCESSING,
    //   });

    // const publicMetadata = getPublicMetadata(user);
    // const websocketUrl = `/avatars/${(ingredientData._id as string).toHexString()}`;

    // // Determine provider (heygen or hedra)
    // const provider = createAvatarDto.provider || Provider.HEYGEN;
    // let externalId: string;

    // if (provider === 'hedra') {
    //   // Use Hedra for avatar generation
    //   externalId = await this.hedraService.generateCharacterWithText(
    //     metadataData._id,
    //     createAvatarDto.text,
    //     createAvatarDto.imageUrl || '', // Hedra requires an image URL
    //     createAvatarDto.voiceId,
    //     createAvatarDto.aspectRatio || '16:9',
    //     publicMetadata.organization,
    //   );
    // } else {
    //   // Use HeyGen for avatar generation (default)
    //   externalId = await this.heygenService.generateAvatarVideo(
    //     metadataData._id,
    //     createAvatarDto.avatarId,
    //     createAvatarDto.voiceId,
    //     createAvatarDto.text,
    //     publicMetadata.organization,
    //   );
    // }

    // if (externalId) {
    //   await this.metadataService.patch(
    //     metadataData._id,
    //     new MetadataEntity({
    //       externalId,
    //     }),
    //   );
    // } else {
    // await this.failedGenerationService.handleFailedAvatarGeneration(
    //   this.avatarsService,
    //   ingredientId.toString(),
    //   websocketUrl,
    // );
    // }

    return serializeSingle(request, IngredientSerializer, createAvatarDto);
  }
}
