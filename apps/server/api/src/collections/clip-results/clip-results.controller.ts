import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
import { UpdateClipResultDto } from '@api/collections/clip-results/dto/update-clip-result.dto';
import { type ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { ClipResultSerializer } from '@genfeedai/serializers';
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

@AutoSwagger()
@Controller('clip-results')
@ApiBearerAuth()
export class ClipResultsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly clipResultsService: ClipResultsService,
    readonly _loggerService: LoggerService,
  ) {}

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @Body() createClipResultDto: CreateClipResultDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const data: ClipResultDocument = await this.clipResultsService.create({
      ...createClipResultDto,
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    } as CreateClipResultDto);

    return serializeSingle(request, ClipResultSerializer, data);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @Query('project') projectId: string,
    @Query('filter[project]') filterProjectId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const resolvedProjectId = projectId || filterProjectId;

    if (resolvedProjectId) {
      const data =
        await this.clipResultsService.findByProject(resolvedProjectId);
      return serializeCollection(request, ClipResultSerializer, {
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

    const data = await this.clipResultsService.findAllByOrganization(
      publicMetadata.organization,
    );

    return serializeCollection(request, ClipResultSerializer, {
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
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const data = await this.clipResultsService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!data) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, ClipResultSerializer, data);
  }

  @Patch(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() updateClipResultDto: UpdateClipResultDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const existing = await this.clipResultsService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!existing) {
      return returnNotFound(this.constructorName, id);
    }

    const data: ClipResultDocument = await this.clipResultsService.patch(
      id,
      updateClipResultDto,
    );

    return serializeSingle(request, ClipResultSerializer, data);
  }
}
