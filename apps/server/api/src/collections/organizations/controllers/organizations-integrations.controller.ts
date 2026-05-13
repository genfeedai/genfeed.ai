import { CreateIntegrationDto } from '@api/endpoints/integrations/dto/create-integration.dto';
import { UpdateIntegrationDto } from '@api/endpoints/integrations/dto/update-integration.dto';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { OrgIntegrationSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
    @CurrentUser() user: User,
    @Param('organizationId') organizationId: string,
    @Body() createIntegrationDto: CreateIntegrationDto,
  ) {
    this.assertOrgAccess(user, organizationId);
    const data = await this.integrationsService.create(
      organizationId,
      createIntegrationDto,
    );
    return serializeSingle(request, OrgIntegrationSerializer, data);
  }

  @Get()
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('organizationId') organizationId: string,
  ) {
    this.assertOrgAccess(user, organizationId);
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
    @CurrentUser() user: User,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    this.assertOrgAccess(user, organizationId);
    const data = await this.integrationsService.findOne(organizationId, id);
    return serializeSingle(request, OrgIntegrationSerializer, data);
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() updateIntegrationDto: UpdateIntegrationDto,
  ) {
    this.assertOrgAccess(user, organizationId);
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
    @CurrentUser() user: User,
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
  ): Promise<void> {
    this.assertOrgAccess(user, organizationId);
    return this.integrationsService.remove(organizationId, id);
  }

  /**
   * Verify the authenticated user's organization matches the requested organizationId.
   * Prevents cross-tenant access via URL parameter manipulation.
   */
  private assertOrgAccess(user: User, organizationId: string): void {
    const { organization } = getPublicMetadata(user);
    if (String(organization) !== organizationId) {
      throw new ForbiddenException('Access denied: organization mismatch');
    }
  }
}
