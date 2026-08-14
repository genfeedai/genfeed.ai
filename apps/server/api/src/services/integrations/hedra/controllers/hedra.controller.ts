import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { HedraService } from '@api/services/integrations/hedra/services/hedra.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
} from '@nestjs/common';

type HedraCollectionResponse<T extends string, A> = {
  data: {
    type: T;
    attributes: A;
  };
};

type HedraVoicesResponse = HedraCollectionResponse<
  'voices',
  {
    voices: unknown[];
    provider: 'hedra';
    count: number;
  }
>;

type HedraAvatarsResponse = HedraCollectionResponse<
  'avatars',
  {
    avatars: unknown[];
    provider: 'hedra';
    count: number;
  }
>;

type HedraJobStatusResponse = HedraCollectionResponse<
  'job-status',
  {
    jobId: string;
    [key: string]: unknown;
  }
>;

type HedraStatusResponse = HedraCollectionResponse<
  'service-status',
  {
    provider: 'hedra';
    isConnected: boolean;
    hasCustomKey: boolean;
  }
>;

@AutoSwagger()
@Controller('hedra')
export class HedraController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly hedraService: HedraService,
  ) {}

  @Get('voices')
  async getVoices(@CurrentUser() user: User): Promise<HedraVoicesResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const voices = await this.hedraService.getVoices(user.organizationId);

      return {
        data: {
          attributes: {
            count: voices.length,
            provider: 'hedra',
            voices,
          },
          type: 'voices',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to fetch Hedra voices',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('avatars')
  async getAvatars(@CurrentUser() user: User): Promise<HedraAvatarsResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const avatars = await this.hedraService.getAvatars(user.organizationId);

      return {
        data: {
          attributes: {
            avatars,
            count: avatars.length,
            provider: 'hedra',
          },
          type: 'avatars',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to fetch Hedra avatars',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('jobs/:jobId')
  async getJobStatus(
    @Param('jobId') jobId: string,
    @CurrentUser() user: User,
  ): Promise<HedraJobStatusResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { jobId });

    try {
      const status = await this.hedraService.getJobStatus(
        jobId,
        user.organizationId,
      );

      return {
        data: {
          attributes: {
            jobId,
            ...status,
          },
          type: 'job-status',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to fetch job status',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status')
  async getStatus(@CurrentUser() user: User): Promise<HedraStatusResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      // Try to fetch voices to check if API key is valid
      let isConnected = false;
      let hasCustomKey = false;

      await this.hedraService.getVoices(user.organizationId);
      isConnected = true;

      // Check if using custom key
      hasCustomKey = !!user.organizationId;

      return {
        data: {
          attributes: {
            hasCustomKey,
            isConnected,
            provider: 'hedra',
          },
          type: 'service-status',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to check Hedra status',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
