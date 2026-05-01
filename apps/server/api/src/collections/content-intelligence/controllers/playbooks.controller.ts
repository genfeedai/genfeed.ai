import {
  CreatePlaybookDto,
  UpdatePlaybookDto,
} from '@api/collections/content-intelligence/dto/create-playbook.dto';
import { PlaybookBuilderService } from '@api/collections/content-intelligence/services/playbook-builder.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

// Simple serializer for pattern playbook
const PatternPlaybookSerializer = {
  serialize: (data: unknown) => {
    if (!data) {
      return null;
    }
    const doc =
      typeof (data as { toObject?: unknown }).toObject === 'function'
        ? ((data as { toObject: () => Record<string, unknown> }).toObject() ??
          {})
        : ((data as Record<string, unknown>) ?? {});
    const sourceCreators = Array.isArray(doc.sourceCreators)
      ? doc.sourceCreators
      : [];

    return {
      attributes: {
        description: doc.description,
        insights: doc.insights,
        isActive: doc.isActive,
        lastUpdatedAt: doc.lastUpdatedAt,
        name: doc.name,
        niche: doc.niche,
        patternsCount: doc.patternsCount,
        platform: doc.platform,
        sourceCreators: sourceCreators.map((id: unknown) => String(id)),
      },
      id: String(doc.id ?? doc._id ?? ''),
      type: 'pattern-playbook',
    };
  },
};

@AutoSwagger()
@Controller('content-intelligence/playbooks')
export class PlaybooksController {
  constructor(
    private readonly playbookBuilderService: PlaybookBuilderService,
    readonly _logger: LoggerService,
  ) {}

  @Get()
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    const pipeline = {
      where: {
        isDeleted: false,
        organization: organizationId,
      },
      orderBy: { createdAt: -1 },
    };

    const data = await this.playbookBuilderService.findAll(pipeline, {
      customLabels,
      limit: 100,
      page: 1,
    });

    return serializeCollection(request, PatternPlaybookSerializer, data);
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound('PatternPlaybook', id);
    }

    const publicMetadata = getPublicMetadata(user);
    const data = await this.playbookBuilderService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!data) {
      ErrorResponse.notFound('PatternPlaybook', id);
    }

    return serializeSingle(request, PatternPlaybookSerializer, data);
  }

  @Post()
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: CreatePlaybookDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;
    const userId = publicMetadata.user;

    const data = await this.playbookBuilderService.createPlaybook(
      organizationId,
      userId,
      dto,
    );

    return serializeSingle(request, PatternPlaybookSerializer, data);
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdatePlaybookDto,
  ): Promise<JsonApiSingleResponse> {
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound('PatternPlaybook', id);
    }

    const publicMetadata = getPublicMetadata(user);
    const existing = await this.playbookBuilderService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!existing) {
      ErrorResponse.notFound('PatternPlaybook', id);
    }

    const data = await this.playbookBuilderService.patch(id, dto);

    return serializeSingle(request, PatternPlaybookSerializer, data);
  }

  @Post(':id/build')
  async buildInsights(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound('PatternPlaybook', id);
    }

    const publicMetadata = getPublicMetadata(user);
    const existing = await this.playbookBuilderService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!existing) {
      ErrorResponse.notFound('PatternPlaybook', id);
    }

    // @ts-expect-error TS2554
    const data = await this.playbookBuilderService.buildInsights(id);

    return serializeSingle(request, PatternPlaybookSerializer, data);
  }

  @Delete(':id')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isValidObjectId(id)) {
      ErrorResponse.notFound('PatternPlaybook', id);
    }

    const publicMetadata = getPublicMetadata(user);
    const existing = await this.playbookBuilderService.findOne({
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!existing) {
      ErrorResponse.notFound('PatternPlaybook', id);
    }

    const deleted = await this.playbookBuilderService.remove(id);

    return serializeSingle(request, PatternPlaybookSerializer, deleted);
  }
}
