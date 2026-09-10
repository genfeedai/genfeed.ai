import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateKnowledgeSourceDto } from '@api/collections/contexts/dto/create-knowledge-source.dto';
import { CreateKnowledgeVersionDto } from '@api/collections/contexts/dto/create-knowledge-version.dto';
import {
  KnowledgeEligibilityDto,
  KnowledgeLegalHoldDto,
  KnowledgeProcessingDto,
  KnowledgePurgeScheduleDto,
  KnowledgeVerificationDto,
} from '@api/collections/contexts/dto/knowledge-lifecycle.dto';
import { KnowledgeListDto } from '@api/collections/contexts/dto/knowledge-list.dto';
import { UpdateKnowledgeSourceDto } from '@api/collections/contexts/dto/update-knowledge-source.dto';
import { KnowledgeCaptureService } from '@api/collections/contexts/services/knowledge-capture.service';
import { KnowledgeLegacyBackfillService } from '@api/collections/contexts/services/knowledge-legacy-backfill.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { resolveKnowledgeActor } from '@api/collections/contexts/utils/knowledge-actor.util';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { MemberRole } from '@genfeedai/contracts';
import {
  KnowledgeSourceSerializer,
  KnowledgeSourceVersionSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiBearerAuth()
@Controller('knowledge-sources')
export class KnowledgeSourcesController {
  constructor(
    private readonly records: KnowledgeRecordsService,
    private readonly capture: KnowledgeCaptureService,
    private readonly legacyBackfill: KnowledgeLegacyBackfillService,
  ) {}

  /**
   * Create a source. With `text` or `referenceUrl` the capture also records
   * version 1 and starts the canonical ingestion workflow.
   */
  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Stable capture identity reused for retries; changing its payload returns 409.',
  })
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
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const result = await this.capture.capture(
      resolveKnowledgeActor(user, brandId),
      dto,
      idempotencyKey,
    );
    return {
      ...serializeSingle(request, KnowledgeSourceSerializer, result.source),
      ...(result.jobId ? { jobId: result.jobId } : {}),
      ...(result.version ? { versionId: result.version.id } : {}),
    };
  }

  /**
   * Convert this organization's legacy bookmarks and context sources into
   * Knowledge exactly once. Safe to call again: migrated rows are skipped and
   * the latest report replaces the previous one.
   */
  @Post('backfill-legacy')
  async backfillLegacy(@CurrentUser() user: AuthenticatedUser) {
    return this.legacyBackfill.run(user.organizationId);
  }

  /** Queue ingestion for every current version that is not ready yet. */
  @Post('backfill')
  async backfill(@CurrentUser() user: AuthenticatedUser) {
    return this.capture.backfill(user.organizationId);
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
    const result = await this.capture.createVersion(
      resolveKnowledgeActor(user, brandId),
      id,
      dto,
    );
    return {
      ...serializeSingle(
        request,
        KnowledgeSourceVersionSerializer,
        result.version,
      ),
      jobId: result.jobId,
    };
  }

  /** Requeue the current version after a failure without creating duplicates. */
  @Post(':sourceId/retry')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async retry(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    const result = await this.capture.retry(
      resolveKnowledgeActor(user, brandId),
      id,
    );
    return {
      ...serializeSingle(
        request,
        KnowledgeSourceVersionSerializer,
        result.version,
      ),
      jobId: result.jobId,
    };
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
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
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
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
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

  @Post(':sourceId/versions/:versionId/legal-hold')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async legalHold(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Body() dto: KnowledgeLegalHoldDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.setLegalHold(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
        dto.isLegalHold,
      ),
    );
  }

  @Post(':sourceId/versions/:versionId/erase')
  @UseGuards(RolesGuard)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN)
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
    description:
      'Selected brand in the authenticated organization; omit for organization scope',
  })
  async erase(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') sourceId: string,
    @Param('versionId') id: string,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceVersionSerializer,
      await this.records.eraseVersion(
        resolveKnowledgeActor(user, brandId),
        sourceId,
        id,
      ),
    );
  }
}
