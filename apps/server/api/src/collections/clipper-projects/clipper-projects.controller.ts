import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { CreateClipperProjectDto } from '@api/collections/clipper-projects/dto/create-clipper-project.dto';
import { UpdateClipperProjectDto } from '@api/collections/clipper-projects/dto/update-clipper-project.dto';
import type { ClipperProjectDocument } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import { ClipperIdentityResolutionService } from '@api/collections/clipper-projects/services/clipper-identity-resolution.service';
import { ClipperProjectClientSourceService } from '@api/collections/clipper-projects/services/clipper-project-client-source.service';
import { HookClipApprovalService } from '@api/collections/clipper-projects/services/hook-clipper-approval.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { SearchBaseQueryDto } from '@api/helpers/dto/search-base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { buildSearchWhere } from '@api/helpers/utils/search-where/search-where.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/contracts/interfaces';
import { ClipperProjectSerializer } from '@genfeedai/serializers';
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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('clipper-projects')
@ApiBearerAuth()
@FeatureFlag('clipper')
@OrganizationModule('clipper')
@Controller('clipper-projects')
@UseGuards(RolesGuard)
export class ClipperProjectsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly clipperIdentityResolutionService: ClipperIdentityResolutionService,
    private readonly hookClipApprovalService: HookClipApprovalService,
    private readonly clipperProjectClientSourceService: ClipperProjectClientSourceService,
  ) {}

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateClipperProjectDto,
  ): Promise<JsonApiSingleResponse> {
    if (createDto.brandId) {
      await this.clipperIdentityResolutionService.resolve({
        brandId: createDto.brandId,
        organizationId: user.organizationId,
      });
    }

    const source = await this.clipperProjectClientSourceService.resolve(
      createDto,
      user.organizationId,
      createDto.brandId,
    );
    const data: ClipperProjectDocument =
      await this.clipperProjectsService.create({
        ...createDto,
        ...source,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      });

    return serializeSingle(request, ClipperProjectSerializer, data);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SearchBaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate = {
      where: {
        isDeleted: false,
        organizationId: tenant.organizationId,
        ...(tenant.isOrganizationOverride && tenant.brandId
          ? { brandId: tenant.brandId }
          : query.brandId
            ? // A brand's list also shows org-wide projects that have no brand.
              { OR: [{ brandId: null }, { brandId: query.brandId }] }
            : {}),
        // A clip project's name and source link live in its config.
        ...buildSearchWhere(query.search, {
          json: { config: ['name', 'sourceVideoUrl'] },
        }),
      },
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : ({ createdAt: -1 } as SortObject),
    };

    const data: AggregatePaginateResult<ClipperProjectDocument> =
      await this.clipperProjectsService.findAll(aggregate, options);
    return serializeCollection(request, ClipperProjectSerializer, data);
  }

  @TenantReadPolicy('mutating')
  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const hookApproval = await this.hookClipApprovalService.getStatus(
      id,
      user.organizationId,
    );
    const data = this.hookClipApprovalService.isProjectReconciliationBlocked(
      hookApproval,
    )
      ? await this.clipperProjectsService.findOne({
          id,
          isDeleted: false,
          organizationId: user.organizationId,
        })
      : await this.clipperProjectsService.reconcileTerminalState(
          id,
          user.organizationId,
        );

    if (!data) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, ClipperProjectSerializer, data);
  }

  @Patch(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateClipperProjectDto,
  ): Promise<JsonApiSingleResponse> {
    const existing = await this.clipperProjectsService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!existing) {
      return returnNotFound(this.constructorName, id);
    }

    const hasSourceUpdate =
      updateDto.sourceVideoS3Key !== undefined ||
      updateDto.sourceVideoUrl !== undefined;
    const source = hasSourceUpdate
      ? await this.clipperProjectClientSourceService.resolve(
          updateDto,
          user.organizationId,
          updateDto.brandId ?? existing.brandId,
        )
      : null;
    const data: ClipperProjectDocument =
      await this.clipperProjectsService.patch(
        id,
        {
          ...updateDto,
          ...(source
            ? {
                ...source,
                // Config merging ignores undefined. An explicit null prevents a
                // keyless source from retaining and reading the previous object.
                sourceVideoS3Key: source.sourceVideoS3Key ?? null,
              }
            : {}),
        },
        [],
        user.organizationId,
      );

    return serializeSingle(request, ClipperProjectSerializer, data);
  }
}
