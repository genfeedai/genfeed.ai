import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  describeProviderCatalogError,
  type ProviderCatalogResponse,
  serializeProviderCatalog,
  throwProviderCatalogError,
} from '@api/services/integrations/_shared/serialize-provider-catalog';
import { HeyGenAvatarPageDto } from '@api/services/integrations/heygen/dto/heygen-avatar-page.dto';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { HeyGenSpeechVoicesService } from '@api/services/integrations/heygen/services/heygen-speech-voices.service';
import { HeyGenVoiceCatalogService } from '@api/services/integrations/heygen/services/heygen-voice-catalog.service';
import { HEYGEN_CREDENTIALS_INVALID_ERROR_CODE } from '@genfeedai/contracts/constants';
import type {
  HeyGenAvatarCatalogPage,
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
  HeyGenSpeechVoiceCatalog,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Query } from '@nestjs/common';

const HEYGEN_CATALOG_ERROR_OPTIONS = {
  credentialsInvalidCode: HEYGEN_CREDENTIALS_INVALID_ERROR_CODE,
} as const;

type HeygenVoicesResponse = ProviderCatalogResponse<
  'voices',
  {
    voices: HeyGenCatalogVoice[];
    provider: 'heygen';
    count: number;
  }
>;

type HeygenSpeechVoicesResponse = ProviderCatalogResponse<
  'speech-voices',
  HeyGenSpeechVoiceCatalog & {
    provider: 'heygen';
    count: number;
  }
>;

type HeygenAvatarsResponse = ProviderCatalogResponse<
  'avatars',
  {
    avatars: HeyGenCatalogAvatar[];
    provider: 'heygen';
    count: number;
  }
>;

type HeygenStatusResponse = ProviderCatalogResponse<
  'service-status',
  {
    provider: 'heygen';
    isConnected: boolean;
    hasCustomKey: boolean;
    state: 'disconnected' | 'connected' | 'invalid';
  }
>;

@AutoSwagger()
@Controller('heygen')
export class HeyGenController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly heygenService: HeyGenService,
    private readonly speechVoicesService: HeyGenSpeechVoicesService,
    private readonly voiceCatalogService: HeyGenVoiceCatalogService,
  ) {}

  @Get('voices')
  async getVoices(@CurrentUser() user: User): Promise<HeygenVoicesResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const voices = await this.voiceCatalogService.getVoices(
        user.organizationId,
      );

      return serializeProviderCatalog({
        attributes: {
          count: voices.length,
          provider: 'heygen',
          voices,
        },
        type: 'voices',
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        undefined,
        describeProviderCatalogError(error),
      );
      throwProviderCatalogError(
        'Failed to fetch HeyGen voices',
        error,
        HEYGEN_CATALOG_ERROR_OPTIONS,
      );
    }
  }

  /** HeyGen Voice (text-to-speech) voices; `voices` is the avatar video catalog. */
  @Get('speech-voices')
  async getSpeechVoices(
    @CurrentUser() user: User,
  ): Promise<HeygenSpeechVoicesResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const catalog = await this.speechVoicesService.getSpeechVoices(
        user.organizationId,
      );

      return serializeProviderCatalog({
        attributes: {
          ...catalog,
          count: catalog.voices.length,
          provider: 'heygen',
        },
        type: 'speech-voices',
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        undefined,
        describeProviderCatalogError(error),
      );
      throwProviderCatalogError(
        'Failed to fetch HeyGen Voice voices',
        error,
        HEYGEN_CATALOG_ERROR_OPTIONS,
      );
    }
  }

  @Get('avatars/page')
  async getAvatarPage(
    @CurrentUser() user: User,
    @Query() query: HeyGenAvatarPageDto,
  ): Promise<
    ProviderCatalogResponse<
      'avatars',
      HeyGenAvatarCatalogPage & {
        provider: 'heygen';
        count: number;
      }
    >
  > {
    try {
      const page = await this.heygenService.getAvatarPage(
        user.organizationId,
        query.ownership ?? 'public',
        query.cursor,
      );
      return serializeProviderCatalog({
        attributes: { ...page, provider: 'heygen', count: page.avatars.length },
        type: 'avatars',
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} getAvatarPage failed`,
        undefined,
        describeProviderCatalogError(error),
      );
      throwProviderCatalogError(
        'Failed to fetch HeyGen avatars',
        error,
        HEYGEN_CATALOG_ERROR_OPTIONS,
      );
    }
  }

  @Get('avatars')
  async getAvatars(@CurrentUser() user: User): Promise<HeygenAvatarsResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const avatars = await this.heygenService.getAvatars(user.organizationId);

      return serializeProviderCatalog({
        attributes: {
          avatars,
          count: avatars.length,
          provider: 'heygen',
        },
        type: 'avatars',
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        undefined,
        describeProviderCatalogError(error),
      );
      throwProviderCatalogError(
        'Failed to fetch HeyGen avatars',
        error,
        HEYGEN_CATALOG_ERROR_OPTIONS,
      );
    }
  }

  @Get('status')
  async getStatus(@CurrentUser() user: User): Promise<HeygenStatusResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const { hasCustomKey, isConnected, state } =
        await this.heygenService.getConnectionStatus(user.organizationId);

      return serializeProviderCatalog({
        attributes: {
          hasCustomKey,
          state,
          isConnected,
          provider: 'heygen',
        },
        type: 'service-status',
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        undefined,
        describeProviderCatalogError(error),
      );
      throwProviderCatalogError(
        'Failed to check HeyGen status',
        error,
        HEYGEN_CATALOG_ERROR_OPTIONS,
      );
    }
  }
}
