import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentCampaignsQueryDto } from '@api/collections/agent-campaigns/dto/agent-campaigns-query.dto';
import { CreateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/create-agent-campaign.dto';
import { UpdateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/update-agent-campaign.dto';
import type { AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type {
  IAgentCampaignStatusResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { AgentCampaignSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Campaigns')
@AutoSwagger()
@Controller('agent-campaigns')
export class AgentCampaignsController extends BaseCRUDController<
  AgentCampaignDocument,
  CreateAgentCampaignDto,
  UpdateAgentCampaignDto,
  AgentCampaignsQueryDto
> {
  constructor(
    public readonly agentCampaignsService: AgentCampaignsService,
    public readonly loggerService: LoggerService,
    private readonly usersService: UsersService,
    private readonly executionService: AgentCampaignExecutionService,
  ) {
    super(
      loggerService,
      agentCampaignsService,
      AgentCampaignSerializer,
      'AgentCampaign',
      ['organization', 'brand', 'user'],
    );
  }

  /**
   * Update a campaign by ID.
   *
   * Status transitions to 'active' / 'paused' are routed through
   * AgentCampaignExecutionService to preserve the execute/pause guards
   * and cascades (strategy activation, run creation/queueing, timestamp
   * stamping). All other field updates fall through to the inherited
   * BaseCRUDController patch behavior.
   */
  @Patch(':id')
  async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateAgentCampaignDto,
  ): Promise<JsonApiSingleResponse> {
    if (updateDto.status === 'active' || updateDto.status === 'paused') {
      const publicMetadata = getPublicMetadata(user);
      const organizationId = publicMetadata.organization?.toString();

      if (!organizationId) {
        throw new Error('Organization not found');
      }

      const data =
        updateDto.status === 'active'
          ? await this.executionService.execute(
              id,
              organizationId,
              await this.resolveMongoUserId(user),
            )
          : await this.executionService.pause(id, organizationId);

      return serializeSingle(request, AgentCampaignSerializer, data);
    }

    return super.patch(request, user, id, updateDto);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get campaign execution status' })
  async getCampaignStatus(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<IAgentCampaignStatusResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();

    if (!organizationId) {
      throw new Error('Organization not found');
    }

    return this.executionService.getStatus(id, organizationId);
  }

  public buildFindAllQuery(user: User, query: AgentCampaignsQueryDto) {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    const organizationId = publicMetadata.organization?.toString();
    if (organizationId) {
      match.organization = organizationId;
    }

    const brandId = publicMetadata.brand?.toString();
    if (brandId) {
      match.brand = brandId;
    }

    if (query.status) {
      match.status = query.status;
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where: match,
    };
  }

  public canUserModifyEntity(
    user: User,
    entity: AgentCampaignDocument,
  ): boolean {
    const publicMetadata = getPublicMetadata(user);

    const entityOrganizationId =
      (entity.organization as unknown as { id: string })?.id?.toString() ||
      entity.organization?.toString();

    if (
      entityOrganizationId &&
      publicMetadata.organization &&
      entityOrganizationId === publicMetadata.organization
    ) {
      return true;
    }

    return Boolean(publicMetadata?.isSuperAdmin);
  }

  private async resolveMongoUserId(user: User): Promise<string> {
    const authProviderId = user.id;
    if (!authProviderId) {
      throw new UnauthorizedException(
        'Missing user identity. Please sign in again.',
      );
    }

    const { user: metadataUserId } = getPublicMetadata(user);
    if (EntityIdUtil.isValid(metadataUserId)) {
      const metadataUserDoc = await this.usersService.findOne(
        { _id: metadataUserId, authProviderId },
        [],
      );
      if (metadataUserDoc?.id) {
        return String(metadataUserDoc.id);
      }
    }

    const dbUser = await this.usersService.findOne({ authProviderId }, []);
    if (!dbUser?.id) {
      throw new UnauthorizedException('User account not found');
    }

    const mongoUserId = String(dbUser.id);
    if (!EntityIdUtil.isValid(mongoUserId)) {
      throw new UnauthorizedException('Invalid user account reference');
    }

    return mongoUserId;
  }
}
