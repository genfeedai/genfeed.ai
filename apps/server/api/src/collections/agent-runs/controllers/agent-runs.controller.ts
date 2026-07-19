import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  AgentRunStatsQueryDto,
  AgentRunsQueryDto,
} from '@api/collections/agent-runs/dto/agent-runs-query.dto';
import { CreateAgentRunDto } from '@api/collections/agent-runs/dto/create-agent-run.dto';
import { UpdateAgentRunDto } from '@api/collections/agent-runs/dto/update-agent-run.dto';
import type { AgentRunDocument } from '@api/collections/agent-runs/schemas/agent-run.schema';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { AgentExecutionStatus } from '@genfeedai/enums';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import {
  AgentRunSerializer,
  sanitizeAgentRunCollectionForSerialization,
  sanitizeAgentRunForSerialization,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Runs')
@AutoSwagger()
@Controller('runs')
export class AgentRunsController extends BaseCRUDController<
  AgentRunDocument,
  CreateAgentRunDto,
  UpdateAgentRunDto,
  AgentRunsQueryDto
> {
  constructor(
    public readonly agentRunsService: AgentRunsService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, agentRunsService, AgentRunSerializer, 'AgentRun', [
      'organization',
      'user',
    ]);
  }

  /**
   * Override enrichCreateDto to ensure organizationId is always derived from the
   * authenticated user's token — never from the request body. This prevents an
   * attacker from submitting a different org's ID to create records in another tenant.
   */
  public override enrichCreateDto(
    createDto: Partial<CreateAgentRunDto>,
    user: User,
  ): CreateAgentRunDto {
    const publicMetadata = getPublicMetadata(user);
    const dto = createDto as Record<string, unknown>;

    // Strip tenant/user scope supplied in the body; auth metadata is authoritative.
    delete dto.brand;
    delete dto.brandId;
    delete dto.organization;
    delete dto.organizationId;
    delete dto.user;
    delete dto.userId;

    return {
      ...createDto,
      ...(publicMetadata.brand ? { brandId: publicMetadata.brand } : {}),
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
    } as CreateAgentRunDto;
  }

  public buildFindAllQuery(user: User, query: AgentRunsQueryDto) {
    const publicMetadata = getPublicMetadata(user);
    const match: Record<string, unknown> = {
      isDeleted: false,
    };

    const organizationId = publicMetadata.organization?.toString();
    if (organizationId) {
      match.organization = organizationId;
    }

    const brandId = publicMetadata.brand?.toString() ?? query.brand;
    if (brandId) {
      match.brand = brandId;
    }

    if (query.historyOnly) {
      match.status = {
        notIn: [AgentExecutionStatus.PENDING, AgentExecutionStatus.RUNNING],
      };
    } else if (query.status) {
      match.status = query.status;
    }

    if (query.strategy) {
      match.strategy = query.strategy;
    }

    if (query.trigger) {
      match.trigger = query.trigger;
    }

    const metadataFilters: Record<string, unknown>[] = [];

    if (query.routingPolicy) {
      metadataFilters.push({
        metadata: { path: ['routingPolicy'], equals: query.routingPolicy },
      });
    }

    if (query.webSearchEnabled !== undefined) {
      metadataFilters.push({
        metadata: {
          path: ['webSearchEnabled'],
          equals: query.webSearchEnabled,
        },
      });
    }

    if (metadataFilters.length === 1) {
      Object.assign(match, metadataFilters[0]);
    } else if (metadataFilters.length > 1) {
      const existingAnd = Array.isArray(match.AND) ? match.AND : [];
      match.AND = [...existingAnd, ...metadataFilters];
    }

    if (query.model) {
      match.OR = [
        { metadata: { path: ['actualModel'], string_contains: query.model } },
        {
          metadata: { path: ['requestedModel'], string_contains: query.model },
        },
      ];
    }

    if (query.q) {
      const searchConditions = [
        { label: { contains: query.q, mode: 'insensitive' } },
        { objective: { contains: query.q, mode: 'insensitive' } },
        { metadata: { path: ['actualModel'], string_contains: query.q } },
        { metadata: { path: ['requestedModel'], string_contains: query.q } },
        { metadata: { path: ['routingPolicy'], string_contains: query.q } },
      ];

      if (Array.isArray(match.OR)) {
        const existingAnd = Array.isArray(match.AND) ? match.AND : [];
        match.AND = [
          ...existingAnd,
          { OR: [...(match.OR as unknown[])] },
          { OR: searchConditions },
        ];
        delete match.OR;
      } else {
        match.OR = searchConditions;
      }
    }

    let orderBy: Record<string, number>;
    if (query.sortMode === 'model') {
      orderBy = { createdAt: -1 };
    } else if (query.sortMode === 'credits') {
      orderBy = { createdAt: -1, creditsUsed: -1 };
    } else if (query.sortMode === 'duration') {
      orderBy = { createdAt: -1, durationMs: -1 };
    } else {
      orderBy = handleQuerySort(query.sort);
    }

    return { orderBy, where: match };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List agent runs with filtering and sorting' })
  @ApiResponse({ description: 'Runs returned', status: 200 })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: AgentRunsQueryDto,
  ) {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };
    const aggregate = this.buildFindAllQuery(user, query);
    const data = await this.agentRunsService.findAll(aggregate, options);
    return serializeCollection(
      request,
      AgentRunSerializer,
      sanitizeAgentRunCollectionForSerialization(data),
    );
  }

  public canUserModifyEntity(user: User, entity: AgentRunDocument): boolean {
    const publicMetadata = getPublicMetadata(user);

    if (publicMetadata?.isSuperAdmin) {
      return true;
    }

    const entityOrganizationId =
      (entity.organization as unknown as { id: string })?.id?.toString() ||
      entity.organization?.toString();
    const entityBrandId =
      (entity.brand as unknown as { id?: string })?.id?.toString() ||
      entity.brand?.toString();

    if (
      publicMetadata.brand &&
      entityBrandId &&
      entityBrandId !== publicMetadata.brand
    ) {
      return false;
    }

    if (
      entityOrganizationId &&
      publicMetadata.organization &&
      entityOrganizationId === publicMetadata.organization
    ) {
      return true;
    }

    return false;
  }

  @Get('active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get active agent runs' })
  @ApiResponse({ description: 'Active runs returned', status: 200 })
  async getActiveRuns(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const runs = await this.agentRunsService.getActiveRuns(
      publicMetadata.organization,
      {
        brandId: publicMetadata.brand,
        cursor,
        limit: limit ? Number.parseInt(limit, 10) : undefined,
      },
    );
    return serializeCollection(
      request,
      AgentRunSerializer,
      sanitizeAgentRunCollectionForSerialization({ docs: runs }),
    );
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get agent run statistics' })
  @ApiResponse({ description: 'Stats returned', status: 200 })
  async getStats(
    @CurrentUser() user: User,
    @Query() query: AgentRunStatsQueryDto,
  ) {
    const publicMetadata = getPublicMetadata(user);
    return await this.agentRunsService.getStats(
      publicMetadata.organization,
      query,
      publicMetadata.brand,
    );
  }

  @Get('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get summary data for multiple agent runs by ID' })
  @ApiResponse({ description: 'Batch run summaries returned', status: 200 })
  async getBatch(
    @Query('ids') idsParam: string,
    @CurrentUser() user: User,
  ): Promise<{
    runs: Array<{ id: string; threadId: string | null; contentCount: number }>;
  }> {
    if (!idsParam || idsParam.trim().length === 0) {
      throw new BadRequestException('ids query parameter is required');
    }

    const ids = idsParam
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, 50);

    if (ids.length === 0) {
      throw new BadRequestException('At least one valid ID is required');
    }

    const publicMetadata = getPublicMetadata(user);
    const runs = await this.agentRunsService.getBatchWithContent(
      ids,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    return { runs };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a single agent run by ID' })
  @ApiResponse({ description: 'Run returned', status: 200 })
  override async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('brand') requestedBrandId?: string,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const brandId = publicMetadata.brand ?? requestedBrandId;
    const doc = await this.agentRunsService.findOne({
      _id: id,
      ...(brandId ? { brand: brandId } : {}),
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!doc) {
      throw new NotFoundException('Agent run');
    }

    return serializeSingle(
      request,
      AgentRunSerializer,
      sanitizeAgentRunForSerialization(doc),
    );
  }

  @Get(':id/content')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get content produced by an agent run' })
  @ApiResponse({ description: 'Run content returned', status: 200 })
  async getRunContent(@Param('id') id: string, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const content = await this.agentRunsService.getRunContent(
      id,
      publicMetadata.organization,
      publicMetadata.brand,
    );

    if (!content) {
      throw new NotFoundException('Agent run');
    }

    return content;
  }
}
