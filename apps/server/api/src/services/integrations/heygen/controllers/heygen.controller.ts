import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  type ProviderCatalogResponse,
  serializeProviderCatalog,
  throwProviderCatalogError,
} from '@api/services/integrations/_shared/serialize-provider-catalog';
import { HeyGenAvatarPageDto } from '@api/services/integrations/heygen/dto/heygen-avatar-page.dto';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type {
  HeyGenAvatarCatalogPage,
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Query } from '@nestjs/common';

type HeygenVoicesResponse = ProviderCatalogResponse<
  'voices',
  {
    voices: HeyGenCatalogVoice[];
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
  ) {}

  @Get('voices')
  async getVoices(@CurrentUser() user: User): Promise<HeygenVoicesResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const voices = await this.heygenService.getVoices(user.organizationId);

      return serializeProviderCatalog({
        attributes: {
          count: voices.length,
          provider: 'heygen',
          voices,
        },
        type: 'voices',
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throwProviderCatalogError('Failed to fetch HeyGen voices', error);
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
        error,
      );
      throwProviderCatalogError('Failed to fetch HeyGen avatars', error);
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
      this.loggerService.error(`${url} failed`, error);
      throwProviderCatalogError('Failed to fetch HeyGen avatars', error);
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
      this.loggerService.error(`${url} failed`, error);
      throwProviderCatalogError('Failed to check HeyGen status', error);
    }
  }
}
