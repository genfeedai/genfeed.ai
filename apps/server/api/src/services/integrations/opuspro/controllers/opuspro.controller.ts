import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { OpusProService } from '@api/services/integrations/opuspro/services/opuspro.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

type OpusProCollectionResponse<T extends string, A> = {
  data: {
    type: T;
    attributes: A;
  };
};

type OpusProStatusResponse = OpusProCollectionResponse<
  'service-status',
  {
    provider: 'opuspro';
    isConnected: boolean;
  }
>;

type OpusProTemplatesResponse = OpusProCollectionResponse<
  'templates',
  {
    templates: Array<{
      templateId: string;
      name: string;
      description?: string;
      preview?: string;
    }>;
    provider: 'opuspro';
    count: number;
  }
>;

type OpusProGenerateResponse = OpusProCollectionResponse<
  'video-generation',
  {
    videoId: string;
    provider: 'opuspro';
    status: string;
  }
>;

type OpusProVideoStatusResponse = OpusProCollectionResponse<
  'video-status',
  {
    provider: 'opuspro';
    status: string;
    videoUrl?: string;
    progress?: number;
    error?: string;
  }
>;

type GenerateVideoBody = {
  templateId: string;
  params?: Record<string, unknown>;
};

@AutoSwagger()
@Controller('opuspro')
export class OpusProController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly opusProService: OpusProService,
  ) {}

  @Get('status')
  async getStatus(@CurrentUser() user: User): Promise<OpusProStatusResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const publicMetadata = getPublicMetadata(user);
      let isConnected = false;

      try {
        await this.opusProService.getAccountInfo(publicMetadata.organization);
        isConnected = true;
      } catch {
        isConnected = false;
      }

      return {
        data: {
          attributes: {
            isConnected,
            provider: 'opuspro',
          },
          type: 'service-status',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to check Opus Pro status',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('templates')
  async getTemplates(
    @CurrentUser() user: User,
  ): Promise<OpusProTemplatesResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const publicMetadata = getPublicMetadata(user);
      const templates = await this.opusProService.getTemplates(
        publicMetadata.organization,
      );

      return {
        data: {
          attributes: {
            count: templates.length,
            provider: 'opuspro',
            templates,
          },
          type: 'templates',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to fetch Opus Pro templates',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('generate')
  async generateVideo(
    @CurrentUser() user: User,
    @Body() body: GenerateVideoBody,
  ): Promise<OpusProGenerateResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const publicMetadata = getPublicMetadata(user);
      const videoId = await this.opusProService.generateVideo(
        '', // metadataId — caller should provide via upstream workflow
        body.templateId,
        body.params || {},
        publicMetadata.organization,
        publicMetadata.user,
      );

      return {
        data: {
          attributes: {
            provider: 'opuspro',
            status: 'processing',
            videoId,
          },
          type: 'video-generation',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to generate Opus Pro video',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status/:videoId')
  async getVideoStatus(
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
  ): Promise<OpusProVideoStatusResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const publicMetadata = getPublicMetadata(user);
      const status = await this.opusProService.getVideoStatus(
        videoId,
        publicMetadata.organization,
      );

      return {
        data: {
          attributes: {
            ...status,
            provider: 'opuspro',
          },
          type: 'video-status',
        },
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: (error as Error)?.message ?? 'Unknown error occurred',
          title: 'Failed to check Opus Pro video status',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
