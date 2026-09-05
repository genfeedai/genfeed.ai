import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateKnowledgeSourceDto } from '@api/collections/contexts/dto/create-knowledge-source.dto';
import { CreateKnowledgeVersionDto } from '@api/collections/contexts/dto/create-knowledge-version.dto';
import {
  KnowledgeEligibilityDto,
  KnowledgeProcessingDto,
  KnowledgePurgeScheduleDto,
  KnowledgeVerificationDto,
} from '@api/collections/contexts/dto/knowledge-lifecycle.dto';
import { KnowledgeListDto } from '@api/collections/contexts/dto/knowledge-list.dto';
import { UpdateKnowledgeSourceDto } from '@api/collections/contexts/dto/update-knowledge-source.dto';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { resolveKnowledgeActor } from '@api/collections/contexts/utils/knowledge-actor.util';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import {
  KnowledgeSourceSerializer,
  KnowledgeSourceVersionSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiBearerAuth()
@Controller('knowledge-sources')
export class KnowledgeSourcesController {
  constructor(private readonly records: KnowledgeRecordsService) {}

  @Post()
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async create(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeSourceDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceSerializer,
      await this.records.createSource(
        resolveKnowledgeActor(user, brandId),
        dto,
      ),
    );
  }

  @Get()
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: KnowledgeListDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeCollection(
      request,
      KnowledgeSourceSerializer,
      await this.records.listSources(
        resolveKnowledgeActor(user, brandId),
        query.page,
        query.limit,
      ),
    );
  }

  @Get('eligible-versions')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async eligible(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: KnowledgeListDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeCollection(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.listEligibleVersions(
        resolveKnowledgeActor(user, brandId),
        query.page,
        query.limit,
      ),
    );
  }

  @Get(':sourceId')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async find(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceSerializer,
      await this.records.getSource(resolveKnowledgeActor(user, brandId), id),
    );
  }

  @Patch(':sourceId')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async update(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
    @Body() dto: UpdateKnowledgeSourceDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceSerializer,
      await this.records.updateSource(
        resolveKnowledgeActor(user, brandId),
        id,
        dto,
      ),
    );
  }

  @Delete(':sourceId')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async remove(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceSerializer,
      await this.records.deleteSource(resolveKnowledgeActor(user, brandId), id),
    );
  }

  @Post(':sourceId/versions')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async version(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
    @Body() dto: CreateKnowledgeVersionDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.createVersion(
        resolveKnowledgeActor(user, brandId),
        id,
        dto,
      ),
    );
  }

  @Get(':sourceId/versions')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async versions(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Query() query: KnowledgeListDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeCollection(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.listVersions(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        query.page,
        query.limit,
      ),
    );
  }

  @Get(':sourceId/versions/:versionId')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async receipt(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.getVersion(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/processing')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async processing(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgeProcessingDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.setProcessing(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
        dto.state,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/eligibility')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async eligibility(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgeEligibilityDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.setEligibility(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
        dto.state,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/verify')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async verify(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgeVerificationDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.verifyVersion(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
        dto.verifiedAt,
        dto.expiresAt,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/schedule-purge')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async schedule(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgePurgeScheduleDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.schedulePurge(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
        dto.purgeScheduledAt,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/purge')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async purge(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.purgeVersion(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
      ),
    );
  }
}
