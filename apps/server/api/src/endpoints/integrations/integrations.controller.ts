import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { IntegrationPlatform } from '@genfeedai/enums';
import type { OrgIntegration } from '@genfeedai/prisma';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';

// Internal controller for integration services
@Controller('internal/integrations')
@Public()
@UseGuards(AdminApiKeyGuard)
export class InternalIntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

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
