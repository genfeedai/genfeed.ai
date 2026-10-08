import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  type ProviderCatalogResponse,
  serializeProviderCatalog,
  throwProviderCatalogError,
} from '@api/services/integrations/_shared/serialize-provider-catalog';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type {
  HeyGenCatalogAvatar,
  HeyGenCatalogVoice,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get } from '@nestjs/common';

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
