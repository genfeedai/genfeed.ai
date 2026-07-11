import { UploadIntegrationMediaDto } from '@api/endpoints/integrations/dto/upload-integration-media.dto';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { FileInputType, IntegrationPlatform } from '@genfeedai/enums';
import type { OrgIntegration } from '@genfeedai/prisma';
import { Public } from '@libs/decorators/public.decorator';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { nanoid } from 'nanoid';

// Internal controller for integration services
@Controller('internal/integrations')
@Public()
@UseGuards(AdminApiKeyGuard)
export class InternalIntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly filesClientService: FilesClientService,
  ) {}

  /**
   * Mirror an external media URL into our storage and return the durable
   * public URL. Lets channel bots avoid persisting transport URLs that
   * embed credentials (Telegram file URLs contain the bot token).
   */
  @Post(':platform/media')
  @ApiParam({
    enum: IntegrationPlatform,
    enumName: 'IntegrationPlatform',
    name: 'platform',
  })
  async uploadMedia(
    @Param('platform') platform: IntegrationPlatform,
    @Body() body: UploadIntegrationMediaDto,
  ): Promise<{ data: { url: string } }> {
    const key = `integrations/${platform}/${body.organizationId}/${nanoid()}`;
    const metadata = await this.filesClientService.uploadToS3(key, 'images', {
      type: FileInputType.URL,
      url: body.fileUrl,
    });

    return { data: { url: String(metadata.publicUrl ?? '') } };
  }

  @Get(':platform')
  @ApiParam({
    enum: IntegrationPlatform,
    enumName: 'IntegrationPlatform',
    name: 'platform',
  })
  getByPlatform(
    @Param('platform') platform: IntegrationPlatform,
  ): ReturnType<IntegrationsService['findByPlatform']> {
    return this.integrationsService.findByPlatform(platform);
  }

  @Get(':platform/:id')
  @ApiParam({
    enum: IntegrationPlatform,
    enumName: 'IntegrationPlatform',
    name: 'platform',
  })
  getOneByPlatform(
    @Param('platform') platform: IntegrationPlatform,
    @Param('id') id: string,
  ): ReturnType<IntegrationsService['findOneByPlatform']> {
    return this.integrationsService.findOneByPlatform(platform, id);
  }
}
