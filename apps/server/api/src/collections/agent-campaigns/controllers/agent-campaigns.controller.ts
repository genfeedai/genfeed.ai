import { AgentCampaignsQueryDto } from '@api/collections/agent-campaigns/dto/agent-campaigns-query.dto';
import { CreateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/create-agent-campaign.dto';
import { UpdateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/update-agent-campaign.dto';
import {
  AgentCampaign,
  type AgentCampaignDocument,
} from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import type { IAgentCampaignStatusResponse } from '@genfeedai/interfaces';
import { AgentCampaignSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Controller,
  Get,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

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
      AgentCampaign.name,
      ['organization', 'brand', 'user'],
    );
  }

  @Post(':id/execute')
  @ApiOperation({
    summary: 'Execute a campaign — activates all agent strategies',
  })
  async executeCampaign(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<AgentCampaignDocument> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();

    if (!organizationId) {
      throw new Error('Organization not found');
    }

    const mongoUserId = await this.resolveMongoUserId(user);

    return this.executionService.execute(id, organizationId, mongoUserId);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause a running campaign' })
  async pauseCampaign(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<AgentCampaignDocument> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization?.toString();

    if (!organizationId) {
      throw new Error('Organization not found');
    }

    return this.executionService.pause(id, organizationId);
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

  public buildFindAllPipeline(
    user: User,
    query: AgentCampaignsQueryDto,
  ): Record<string, unknown>[] {
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

    const pipeline: Record<string, unknown>[] = [
      { $match: match },
      { $sort: handleQuerySort(query.sort) },
    ];

    return pipeline;
  }

  public canUserModifyEntity(
    user: User,
    entity: AgentCampaignDocument,
  ): boolean {
    const publicMetadata = getPublicMetadata(user);

    const entityOrganizationId =
      (entity.organization as unknown as { _id: string })?._id?.toString() ||
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
    const clerkId = user.id;
    if (!clerkId) {
      throw new UnauthorizedException(
        'Missing user identity. Please sign in again.',
      );
    }

    const { user: metadataUserId } = getPublicMetadata(user);
    if (ObjectIdUtil.isValid(metadataUserId)) {
      const metadataUserDoc = await this.usersService.findOne(
        { _id: metadataUserId, clerkId },
        [],
      );
      if (metadataUserDoc?._id) {
        return String(metadataUserDoc._id);
      }
    }

    const dbUser = await this.usersService.findOne({ clerkId }, []);
    if (!dbUser?._id) {
      throw new UnauthorizedException('User account not found');
    }

    const mongoUserId = String(dbUser._id);
    if (!ObjectIdUtil.isValid(mongoUserId)) {
      throw new UnauthorizedException('Invalid user account reference');
    }

    return mongoUserId;
  }
}
