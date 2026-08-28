import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/interfaces';
import { ClipProjectSerializer } from '@genfeedai/serializers';
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
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ClipProjectsService } from '@server/collections/clip-projects/clip-projects.service';
import { CreateClipProjectDto } from '@server/collections/clip-projects/dto/create-clip-project.dto';
import { UpdateClipProjectDto } from '@server/collections/clip-projects/dto/update-clip-project.dto';
import type { ClipProjectDocument } from '@server/collections/clip-projects/schemas/clip-project.schema';
import { ClipIdentityResolutionService } from '@server/collections/clip-projects/services/clip-identity-resolution.service';
import { HookClipApprovalService } from '@server/collections/clip-projects/services/hook-clip-approval.service';
import { LogMethod } from '@server/helpers/decorators/log/log-method.decorator';
import { BaseQueryDto } from '@server/helpers/dto/base-query.dto';
import { customLabels } from '@server/helpers/utils/pagination.util';
import { AggregatePaginateResult } from '@server/types/aggregate-paginate-result';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('clip-projects')
@ApiBearerAuth()
@Controller('clip-projects')
@UseGuards(RolesGuard)
export class ClipProjectsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipIdentityResolutionService: ClipIdentityResolutionService,
    private readonly hookClipApprovalService: HookClipApprovalService,
  ) {}

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateClipProjectDto,
  ): Promise<JsonApiSingleResponse> {
    if (createDto.brandId) {
      await this.clipIdentityResolutionService.resolve({
        brandId: createDto.brandId,
        organizationId: user.organizationId,
      });
    }

    const data: ClipProjectDocument = await this.clipProjectsService.create({
      ...createDto,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });

    return serializeSingle(request, ClipProjectSerializer, data);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate = {
      where: {
        isDeleted: false,
        organizationId: user.organizationId,
      },
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : ({ createdAt: -1 } as SortObject),
    };

    const data: AggregatePaginateResult<ClipProjectDocument> =
      await this.clipProjectsService.findAll(aggregate, options);
    return serializeCollection(request, ClipProjectSerializer, data);
  }

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
      ? await this.clipProjectsService.findOne({
          id,
          isDeleted: false,
          organizationId: user.organizationId,
        })
      : await this.clipProjectsService.reconcileTerminalState(
          id,
          user.organizationId,
        );

    if (!data) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, ClipProjectSerializer, data);
  }

  @Patch(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateClipProjectDto,
  ): Promise<JsonApiSingleResponse> {
    const existing = await this.clipProjectsService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!existing) {
      return returnNotFound(this.constructorName, id);
    }

    const data: ClipProjectDocument = await this.clipProjectsService.patch(
      id,
      updateDto,
    );

    return serializeSingle(request, ClipProjectSerializer, data);
  }
}
