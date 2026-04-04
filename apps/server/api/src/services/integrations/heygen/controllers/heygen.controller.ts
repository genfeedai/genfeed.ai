import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';

type HeygenCollectionResponse<T extends string, A> = {
  data: {
    type: T;
    attributes: A;
  };
};

type HeygenVoicesResponse = HeygenCollectionResponse<
  'voices',
  {
    voices: Array<{
      voiceId: string;
      name: string;
      preview: string | null;
      index: number;
    }>;
    provider: 'heygen';
    count: number;
  }
>;

type HeygenAvatarsResponse = HeygenCollectionResponse<
  'avatars',
  {
    avatars: Array<{
      avatarId: string;
      name: string;
      preview: string | null;
      index: number;
    }>;
    provider: 'heygen';
    count: number;
  }
>;

type HeygenStatusResponse = HeygenCollectionResponse<
  'service-status',
  {
    provider: 'heygen';
    isConnected: boolean;
    hasCustomKey: boolean;
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
      const publicMetadata = getPublicMetadata(user);
      const voices = await this.heygenService.getVoices(
        publicMetadata.organization,
      );

      return {
        data: {
          attributes: {
            count: voices.length,
            provider: 'heygen',
            voices: voices.map((v) => ({
              index: v.index,
              name: v.name,
              preview: v.preview,
              voiceId: v.voiceId,
            })),
          },
          type: 'voices',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to fetch HeyGen voices',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('avatars')
  async getAvatars(@CurrentUser() user: User): Promise<HeygenAvatarsResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const publicMetadata = getPublicMetadata(user);
      const avatars = await this.heygenService.getAvatars(
        publicMetadata.organization,
      );

      return {
        data: {
          attributes: {
            avatars: avatars.map((a) => ({
              avatarId: a.avatarId,
              index: a.index,
              name: a.name,
              preview: a.preview,
            })),
            count: avatars.length,
            provider: 'heygen',
          },
          type: 'avatars',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to fetch HeyGen avatars',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status')
  async getStatus(@CurrentUser() user: User): Promise<HeygenStatusResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const publicMetadata = getPublicMetadata(user);

      // Try to fetch voices to check if API key is valid
      let isConnected = false;
      let hasCustomKey = false;

      await this.heygenService.getVoices(publicMetadata.organization);
      isConnected = true;

      // Check if using custom key (this is simplified - you may want to check org settings directly)
      hasCustomKey = !!publicMetadata.organization;

      return {
        data: {
          attributes: {
            hasCustomKey,
            isConnected,
            provider: 'heygen',
          },
          type: 'service-status',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to check HeyGen status',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
