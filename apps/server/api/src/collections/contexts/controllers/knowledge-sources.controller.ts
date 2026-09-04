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
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiBearerAuth()
@Controller('knowledge-sources')
export class KnowledgeSourcesController {
  constructor(private readonly records: KnowledgeRecordsService) {}

  @Post()
  async create(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeSourceDto,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceSerializer,
      await this.records.createSource(user, dto),
    );
  }

  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: KnowledgeListDto,
  ) {
    return serializeCollection(
      request,
      KnowledgeSourceSerializer,
      await this.records.listSources(user, query.page, query.limit),
    );
  }

  @Get('eligible-versions')
  async eligible(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return serializeCollection(request, KnowledgeSourceVersionSerializer, {
      docs: await this.records.listEligibleVersions(user),
    });
  }

  @Get(':sourceId')
  async find(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceSerializer,
      await this.records.getSource(user, id),
    );
  }

  @Patch(':sourceId')
  async update(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
    @Body() dto: UpdateKnowledgeSourceDto,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceSerializer,
      await this.records.updateSource(user, id, dto),
    );
  }

  @Delete(':sourceId')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceSerializer,
      await this.records.deleteSource(user, id),
    );
  }

  @Post(':sourceId/versions')
  async version(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
    @Body() dto: CreateKnowledgeVersionDto,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.createVersion(user, id, dto),
    );
  }

  @Get(':sourceId/versions/:versionId')
  async receipt(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.getVersion(user, sourceId, id),
    );
  }

  @Post(':sourceId/versions/:versionId/processing')
  async processing(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgeProcessingDto,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.setProcessing(user, sourceId, id, dto.state),
    );
  }

  @Post(':sourceId/versions/:versionId/eligibility')
  async eligibility(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgeEligibilityDto,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.setEligibility(user, sourceId, id, dto.state),
    );
  }

  @Post(':sourceId/versions/:versionId/verify')
  async verify(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgeVerificationDto,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.verifyVersion(
        user,
        sourceId,
        id,
        dto.verifiedAt,
        dto.expiresAt,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/schedule-purge')
  async schedule(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgePurgeScheduleDto,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.schedulePurge(
        user,
        sourceId,
        id,
        dto.purgeScheduledAt,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/purge')
  async purge(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.purgeVersion(user, sourceId, id),
    );
  }
}
