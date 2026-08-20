import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentCampaignsQueryDto } from '@api/collections/agent-campaigns/dto/agent-campaigns-query.dto';
import { CreateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/create-agent-campaign.dto';
import { CreateAgentCampaignFromTemplateDto } from '@api/collections/agent-campaigns/dto/create-agent-campaign-from-template.dto';
import { UpdateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/update-agent-campaign.dto';
import type { AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
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
  Post,
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
      ['organization', 'brand', 'user', 'agents'],
    );
  }

  @Post('from-template')
  @ApiOperation({ summary: 'Create an atomic Program from a team template' })
  async createFromTemplate(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateAgentCampaignFromTemplateDto,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = user.organizationId?.toString();
    if (!organizationId) {
      throw new UnauthorizedException('Organization not found');
    }

    const data = await this.agentCampaignsService.createFromTemplate({
      ...createDto,
      organizationId,
      userId: await this.resolveDatabaseUserId(user),
    });

    return serializeSingle(request, AgentCampaignSerializer, data);
  }

  public override enrichCreateDto(
    createDto: Partial<CreateAgentCampaignDto>,
    user: User,
  ): CreateAgentCampaignDto {
    if (!user.organizationId) {
      throw new UnauthorizedException('Organization not found');
    }

    return super.enrichCreateDto(createDto, user);
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
      const organizationId = user.organizationId?.toString();

      if (!organizationId) {
        throw new UnauthorizedException('Organization not found');
      }

      const data =
        updateDto.status === 'active'
          ? await this.executionService.execute(
              id,
              organizationId,
              await this.resolveDatabaseUserId(user),
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
    const organizationId = user.organizationId?.toString();

    if (!organizationId) {
      throw new UnauthorizedException('Organization not found');
    }

    return this.executionService.getStatus(id, organizationId);
  }

  public buildFindAllQuery(user: User, query: AgentCampaignsQueryDto) {
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };

    const organizationId = user.organizationId?.toString();
    if (!organizationId) {
      throw new UnauthorizedException('Organization not found');
    }
    match.organizationId = organizationId;

    const brandId = query.brandId ?? user.brandId?.toString();
    if (brandId) {
      match.brandId = brandId;
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
    // Scalar FK: the legacy `organization` alias is undefined unless the query
    // populated the relation, which would drop this ownership check entirely.
    const entityOrganizationId = entity.organizationId;

    if (
      entityOrganizationId &&
      user.organizationId &&
      entityOrganizationId === user.organizationId
    ) {
      return true;
    }

    return false;
  }

  public override async enrichUpdateDto(
    updateDto: Partial<UpdateAgentCampaignDto>,
    user: User,
  ): Promise<UpdateAgentCampaignDto> {
    const organizationId = user.organizationId?.toString();
    if (!organizationId) {
      throw new UnauthorizedException('Organization not found');
    }

    const enriched = await super.enrichUpdateDto(updateDto, user);
    return {
      ...enriched,
      organizationId,
    } as UpdateAgentCampaignDto;
  }

  private async resolveDatabaseUserId(user: User): Promise<string> {
    const metadataUserId = user.userId ?? user.id;
    if (metadataUserId) {
      return metadataUserId;
    }

    const userId = user.id;
    if (!userId) {
      throw new UnauthorizedException(
        'Missing user identity. Please sign in again.',
      );
    }

    const dbUser = await this.usersService.findOne({ id: userId }, []);
    if (!dbUser?.id) {
      throw new UnauthorizedException('User account not found');
    }

    return String(dbUser.id);
  }
}
