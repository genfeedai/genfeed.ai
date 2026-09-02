import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  type ProviderCatalogResponse,
  serializeProviderCatalog,
  throwProviderCatalogError,
} from '@api/services/integrations/_shared/serialize-provider-catalog';
import { OpusProService } from '@api/services/integrations/opuspro/services/opuspro.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';

type OpusProStatusResponse = ProviderCatalogResponse<
  'service-status',
  {
    provider: 'opuspro';
    isConnected: boolean;
  }
>;

type OpusProTemplatesResponse = ProviderCatalogResponse<
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

type OpusProGenerateResponse = ProviderCatalogResponse<
  'video-generation',
  {
    videoId: string;
    provider: 'opuspro';
    status: string;
  }
>;

type OpusProVideoStatusResponse = ProviderCatalogResponse<
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
      let isConnected = false;

      try {
        await this.opusProService.getAccountInfo(user.organizationId);
        isConnected = true;
      } catch {
        isConnected = false;
      }

      return serializeProviderCatalog({
        attributes: {
          isConnected,
          provider: 'opuspro',
        },
        type: 'service-status',
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throwProviderCatalogError('Failed to check Opus Pro status', error);
    }
  }

  @Get('templates')
  async getTemplates(
    @CurrentUser() user: User,
  ): Promise<OpusProTemplatesResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      const templates = await this.opusProService.getTemplates(
        user.organizationId,
      );

      return serializeProviderCatalog({
        attributes: {
          count: templates.length,
          provider: 'opuspro',
          templates,
        },
        type: 'templates',
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throwProviderCatalogError('Failed to fetch Opus Pro templates', error);
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
      const videoId = await this.opusProService.generateVideo(
        '', // metadataId — caller should provide via upstream workflow
        body.templateId,
        body.params || {},
        user.organizationId,
        user.userId ?? user.id,
      );

      return serializeProviderCatalog({
        attributes: {
          provider: 'opuspro',
          status: 'processing',
          videoId,
        },
        type: 'video-generation',
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throwProviderCatalogError('Failed to generate Opus Pro video', error);
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
      const status = await this.opusProService.getVideoStatus(
        videoId,
        user.organizationId,
      );

      return serializeProviderCatalog({
        attributes: {
          ...status,
          provider: 'opuspro',
        },
        type: 'video-status',
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throwProviderCatalogError('Failed to check Opus Pro video status', error);
    }
  }
}
