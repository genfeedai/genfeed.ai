import { randomUUID } from 'node:crypto';
import {
  AppendRunEventDto,
  CreateRunDto,
  RunEventEnvelopeDto,
  RunQueryDto,
  UpdateRunDto,
} from '@api/collections/runs/dto/create-run.dto';
import { RunEntity } from '@api/collections/runs/entities/run.entity';
import { RunsService } from '@api/collections/runs/services/runs.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { ApiKeyScope, RunAuthType } from '@genfeedai/enums';
import { RunSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Runs')
@ApiBearerAuth()
@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  private getHeaderValue(value: string | string[] | undefined): string {
    if (!value) {
      return '';
    }

    if (Array.isArray(value)) {
      return value[0]?.trim() || '';
    }

    return value.trim();
  }

  private extractTraceId(request: Request, dto: CreateRunDto): string {
    const bodyTraceId = dto.traceId?.trim();
    if (bodyTraceId) {
      return bodyTraceId;
    }

    const traceId =
      this.getHeaderValue(request.headers['x-trace-id']) ||
      this.getHeaderValue(request.headers['x-request-id']) ||
      this.getHeaderValue(request.headers['x-correlation-id']);

    if (traceId) {
      return traceId;
    }

    return randomUUID();
  }

  private getRequestContext(user: User): {
    authType: RunAuthType;
    organizationId: string;
    userId: string;
  } {
    const publicMetadata = getPublicMetadata(user);

    if (!publicMetadata?.organization || !publicMetadata?.user) {
      throw new UnauthorizedException('Missing organization or user context');
    }

    const isApiKey = Boolean(
      (publicMetadata as unknown as Record<string, unknown>)?.isApiKey,
    );

    return {
      authType: isApiKey ? RunAuthType.API_KEY : RunAuthType.CLERK,
      organizationId: String(publicMetadata.organization),
      userId: String(publicMetadata.user),
    };
  }

  @Post()
  @RequiredScopes(
    ApiKeyScope.VIDEOS_CREATE,
    ApiKeyScope.IMAGES_CREATE,
    ApiKeyScope.POSTS_CREATE,
    ApiKeyScope.ADMIN,
  )
  @ApiOperation({ summary: 'Create a new run' })
  @ApiResponse({ description: 'Run created successfully', type: RunEntity })
  async create(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Body() dto: CreateRunDto,
  ) {
    const { authType, organizationId, userId } = this.getRequestContext(user);
    const traceId = this.extractTraceId(request, dto);

    const result = await this.runsService.createRun(
      userId,
      organizationId,
      authType,
      {
        ...dto,
        correlationId: dto.correlationId || traceId,
        traceId,
      },
    );

    return serializeSingle(request, RunSerializer, result.run);
  }

  @Get()
  @RequiredScopes(
    ApiKeyScope.VIDEOS_READ,
    ApiKeyScope.IMAGES_READ,
    ApiKeyScope.ANALYTICS_READ,
    ApiKeyScope.ADMIN,
  )
  @ApiOperation({ summary: 'List runs for the current organization' })
  @ApiResponse({ description: 'List of runs' })
  async findAll(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Query() query: RunQueryDto,
  ) {
    const { organizationId } = this.getRequestContext(user);
    const result = await this.runsService.listRuns(organizationId, query);

    return serializeCollection(request, RunSerializer, {
      docs: result.items,
      hasNextPage: result.offset + result.limit < result.total,
      hasPrevPage: result.offset > 0,
      limit: result.limit,
      nextPage: null,
      page: Math.floor(result.offset / result.limit) + 1,
      pagingCounter: result.offset + 1,
      prevPage: null,
      totalDocs: result.total,
      totalPages: Math.ceil(result.total / result.limit),
    });
  }

  @Get(':runId')
  @RequiredScopes(
    ApiKeyScope.VIDEOS_READ,
    ApiKeyScope.IMAGES_READ,
    ApiKeyScope.ANALYTICS_READ,
    ApiKeyScope.ADMIN,
  )
  @ApiOperation({ summary: 'Get a single run by ID' })
  @ApiResponse({ description: 'Run details', type: RunEntity })
  async findOne(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Param('runId') runId: string,
  ) {
    const { organizationId } = this.getRequestContext(user);
    const run = await this.runsService.getRun(runId, organizationId);

    if (!run) {
      throw new NotFoundException('Run not found');
    }

    return serializeSingle(request, RunSerializer, run);
  }

  @Patch(':runId')
  @RequiredScopes(
    ApiKeyScope.VIDEOS_CREATE,
    ApiKeyScope.IMAGES_CREATE,
    ApiKeyScope.POSTS_CREATE,
    ApiKeyScope.ADMIN,
  )
  @ApiOperation({ summary: 'Update run status/output/progress' })
  @ApiResponse({ description: 'Updated run', type: RunEntity })
  async update(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Param('runId') runId: string,
    @Body() dto: UpdateRunDto,
  ) {
    const { organizationId } = this.getRequestContext(user);
    const run = await this.runsService.updateRun(runId, organizationId, dto);

    if (!run) {
      throw new NotFoundException('Run not found');
    }

    return serializeSingle(request, RunSerializer, run);
  }

  @Post(':runId/execute')
  @RequiredScopes(
    ApiKeyScope.VIDEOS_CREATE,
    ApiKeyScope.IMAGES_CREATE,
    ApiKeyScope.POSTS_CREATE,
    ApiKeyScope.ADMIN,
  )
  @ApiOperation({ summary: 'Start run execution' })
  @ApiResponse({ description: 'Run transitioned to running', type: RunEntity })
  async execute(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Param('runId') runId: string,
  ) {
    const { organizationId } = this.getRequestContext(user);
    const run = await this.runsService.executeRun(runId, organizationId);

    if (!run) {
      throw new NotFoundException('Run not found');
    }

    return serializeSingle(request, RunSerializer, run);
  }

  @Post(':runId/cancel')
  @RequiredScopes(
    ApiKeyScope.VIDEOS_CREATE,
    ApiKeyScope.IMAGES_CREATE,
    ApiKeyScope.POSTS_CREATE,
    ApiKeyScope.ADMIN,
  )
  @ApiOperation({ summary: 'Cancel a run' })
  @ApiResponse({ description: 'Run cancelled', type: RunEntity })
  async cancel(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Param('runId') runId: string,
  ) {
    const { organizationId } = this.getRequestContext(user);
    const run = await this.runsService.cancelRun(runId, organizationId);

    if (!run) {
      throw new NotFoundException('Run not found');
    }

    return serializeSingle(request, RunSerializer, run);
  }

  @Get(':runId/events')
  @RequiredScopes(
    ApiKeyScope.VIDEOS_READ,
    ApiKeyScope.IMAGES_READ,
    ApiKeyScope.ANALYTICS_READ,
    ApiKeyScope.ADMIN,
  )
  @ApiOperation({ summary: 'Get ordered run events' })
  @ApiResponse({
    description: 'Events sorted by creation timestamp',
    isArray: true,
    type: RunEventEnvelopeDto,
  })
  async getEvents(@CurrentUser() user: User, @Param('runId') runId: string) {
    const { organizationId } = this.getRequestContext(user);
    const events = await this.runsService.getRunEvents(runId, organizationId);

    if (!events) {
      throw new NotFoundException('Run not found');
    }

    return events;
  }

  @Post(':runId/events')
  @RequiredScopes(
    ApiKeyScope.VIDEOS_CREATE,
    ApiKeyScope.IMAGES_CREATE,
    ApiKeyScope.POSTS_CREATE,
    ApiKeyScope.ADMIN,
  )
  @ApiOperation({ summary: 'Append an event to a run' })
  @ApiResponse({ description: 'Run with appended event', type: RunEntity })
  async appendEvent(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Param('runId') runId: string,
    @Body() event: AppendRunEventDto,
  ) {
    const { organizationId } = this.getRequestContext(user);
    const run = await this.runsService.appendEventForRun(
      runId,
      organizationId,
      event,
    );

    if (!run) {
      throw new NotFoundException('Run not found');
    }

    return serializeSingle(request, RunSerializer, run);
  }
}
