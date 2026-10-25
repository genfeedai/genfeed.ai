import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import { CreateClipperResultDto } from '@api/collections/clipper-results/dto/create-clipper-result.dto';
import { UpdateClipperResultDto } from '@api/collections/clipper-results/dto/update-clipper-result.dto';
import { type ClipperResultDocument } from '@api/collections/clipper-results/schemas/clipper-result.schema';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { ClipperResultSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';

// Clip results accumulate indefinitely per org/project; the HTTP list is
// capped while internal reconciliation reads stay unbounded on purpose.
const CLIPPER_RESULTS_LIST_LIMIT = 100;

@AutoSwagger()
@FeatureFlag('clipper')
@OrganizationModule('clipper')
@Controller('clipper-results')
@ApiBearerAuth()
export class ClipperResultsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly clipperResultsService: ClipperResultsService,
    readonly _loggerService: LoggerService,
  ) {}

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() createClipperResultDto: CreateClipperResultDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const data: ClipperResultDocument =
      await this.clipperResultsService.createForOrganization({
        ...createClipperResultDto,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      });

    return serializeSingle(request, ClipperResultSerializer, data);
  }

  @TenantReadPolicy('selected')
  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @Query('project') projectId: string,
    @Query('filter[project]') filterProjectId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const readScope = resolveTenantReadScope(user);
    const resolvedProjectId = projectId || filterProjectId;

    if (resolvedProjectId) {
      const data = await this.clipperResultsService.findByProject(
        resolvedProjectId,
        readScope.organizationId,
        CLIPPER_RESULTS_LIST_LIMIT,
      );
      return serializeCollection(request, ClipperResultSerializer, {
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

    const data = await this.clipperResultsService.findRecentByOrganization(
      readScope.organizationId,
      CLIPPER_RESULTS_LIST_LIMIT,
    );

    return serializeCollection(request, ClipperResultSerializer, {
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

  @TenantReadPolicy('selected')
  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const readScope = resolveTenantReadScope(user);
    const data = await this.clipperResultsService.findOne({
      id: id,
      organizationId: readScope.organizationId,
    });

    if (!data) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, ClipperResultSerializer, data);
  }

  @Patch(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() updateClipperResultDto: UpdateClipperResultDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const existing = await this.clipperResultsService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!existing) {
      return returnNotFound(this.constructorName, id);
    }

    const data: ClipperResultDocument = await this.clipperResultsService.patch(
      id,
      updateClipperResultDto,
    );

    return serializeSingle(request, ClipperResultSerializer, data);
  }
}
