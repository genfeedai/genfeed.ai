import { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '@api/endpoints/integrations/dto/update-integration.dto';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { OrgIntegrationSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('organizations/:organizationId/integrations')
export class OrganizationsIntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Body() createIntegrationDto: CreateIntegrationDto,
  ) {
    const data = await this.integrationsService.create(
      organizationId,
      createIntegrationDto,
    );
    return serializeSingle(request, OrgIntegrationSerializer, data);
  }

  @Get()
  async findAll(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
  ) {
    const data = await this.integrationsService.findAll(organizationId);
    return serializeCollection(request, OrgIntegrationSerializer, {
      docs: data,
      hasNextPage: false,
      hasPrevPage: false,
      limit: data.length,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs: data.length,
      totalPages: 1,
    });
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    const data = await this.integrationsService.findOne(organizationId, id);
    return serializeSingle(request, OrgIntegrationSerializer, data);
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() updateIntegrationDto: UpdateIntegrationDto,
  ) {
    const data = await this.integrationsService.update(
      organizationId,
      id,
      updateIntegrationDto,
    );
    return serializeSingle(request, OrgIntegrationSerializer, data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.integrationsService.remove(organizationId, id);
  }
}
