import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AvatarsService } from '@api/collections/avatars/services/avatars.service';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { HedraService } from '@api/services/integrations/hedra/services/hedra.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { IngredientCategory } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { AvatarSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  Req,
} from '@nestjs/common';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';
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
    const aggregate = {
      where: {
        category: IngredientCategory.AVATAR,
        isDeleted,
        user: publicMetadata.user,
      },
      orderBy: handleQuerySort(query.sort),
    };

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.avatarsService.findAll(aggregate, options);
    return serializeCollection(request, AvatarSerializer, data);
  }
}
