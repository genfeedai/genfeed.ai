import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CreateKnowledgeSourceDto,
  KNOWLEDGE_CAPTURE_TEXT_MAX_LENGTH,
} from '@api/collections/contexts/dto/create-knowledge-source.dto';
import { CreateKnowledgeVersionDto } from '@api/collections/contexts/dto/create-knowledge-version.dto';
import {
  KnowledgeEligibilityDto,
  KnowledgeProcessingDto,
  KnowledgeVerificationDto,
} from '@api/collections/contexts/dto/knowledge-lifecycle.dto';
import { KnowledgeListDto } from '@api/collections/contexts/dto/knowledge-list.dto';
import { KnowledgeRefreshPolicyDto } from '@api/collections/contexts/dto/knowledge-refresh-policy.dto';
import { UpdateKnowledgeSourceDto } from '@api/collections/contexts/dto/update-knowledge-source.dto';
import { UploadKnowledgeSourceDto } from '@api/collections/contexts/dto/upload-knowledge-source.dto';
import { KnowledgeCaptureService } from '@api/collections/contexts/services/knowledge-capture.service';
import { KnowledgeLegacyBackfillService } from '@api/collections/contexts/services/knowledge-legacy-backfill.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { KnowledgeRefreshService } from '@api/collections/contexts/services/knowledge-refresh.service';
import { KNOWLEDGE_SOURCE_MAX_BYTES } from '@api/collections/contexts/utils/extract-source-text.util';
import {
  extractUploadedDocumentText,
  KNOWLEDGE_UPLOAD_EXTENSIONS,
  KNOWLEDGE_UPLOAD_MIME_TYPES,
} from '@api/collections/contexts/utils/extract-uploaded-document-text.util';
import { resolveKnowledgeActor } from '@api/collections/contexts/utils/knowledge-actor.util';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { UploadValidationPipe } from '@api/helpers/pipes/upload-validation';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { KnowledgeSourceKind } from '@genfeedai/contracts';
import {
  KnowledgeSourceSerializer,
  KnowledgeSourceVersionSerializer,
} from '@genfeedai/serializers';
import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiBearerAuth()
@Controller('knowledge-sources')
export class KnowledgeSourcesController {
  constructor(
    private readonly records: KnowledgeRecordsService,
    private readonly capture: KnowledgeCaptureService,
    private readonly legacyBackfill: KnowledgeLegacyBackfillService,
    private readonly refresh: KnowledgeRefreshService,
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
   * Upload a corpus file (PDF, DOCX, TXT, Markdown). The text is extracted
   * server-side and captured as a TEXT source, so uploads need no object
   * storage and start the same ingestion workflow as pasted text.
   */
  @Post('files')
  @ApiConsumes('multipart/form-data')
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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: KNOWLEDGE_SOURCE_MAX_BYTES },
    }),
  )
  async upload(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile(
      new UploadValidationPipe({
        allowedExtensions: [...KNOWLEDGE_UPLOAD_EXTENSIONS],
        allowedMimeTypes: [...KNOWLEDGE_UPLOAD_MIME_TYPES],
        maxSizeBytes: KNOWLEDGE_SOURCE_MAX_BYTES,
      }),
    )
    file: Express.Multer.File,
    @Body() dto: UploadKnowledgeSourceDto,
    @Query('brandId') brandId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    let text: string;
    try {
      text = extractUploadedDocumentText({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
      });
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'The uploaded file could not be read.',
      );
    }
    if (text.length > KNOWLEDGE_CAPTURE_TEXT_MAX_LENGTH) {
      throw new BadRequestException(
        `The file has more than ${KNOWLEDGE_CAPTURE_TEXT_MAX_LENGTH.toLocaleString('en-US')} characters of text. Split it into smaller files.`,
      );
    }

    const result = await this.capture.capture(
      resolveKnowledgeActor(user, brandId),
      {
        kind: KnowledgeSourceKind.TEXT,
        provenance: {
          fileName: file.originalname,
          mimeType: file.mimetype,
          origin: 'file-upload',
          sizeBytes: file.size,
        },
        purpose: dto.purpose,
        scope: dto.scope,
        text,
        title: dto.title ?? file.originalname,
      },
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
    const actor = resolveKnowledgeActor(user, brandId);
    const source = await this.records.updateSource(actor, id, dto);
    if (dto.isVisible === false) {
      await this.refresh.unscheduleSource(actor, id);
    }
    return serializeSingle(request, KnowledgeSourceSerializer, source);
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
    const actor = resolveKnowledgeActor(user, brandId);
    await this.refresh.unscheduleSource(actor, id);
    return serializeSingle(
      request,
      KnowledgeSourceSerializer,
      await this.records.deleteSource(actor, id),
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
  @Patch(':sourceId/refresh-policy')
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
  })
  async refreshPolicy(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
    @Body() dto: KnowledgeRefreshPolicyDto,
    @Query('brandId') brandId?: string,
  ) {
    return serializeSingle(
      request,
      KnowledgeSourceSerializer,
      await this.refresh.setPolicy(
        resolveKnowledgeActor(user, brandId),
        id,
        dto,
      ),
    );
  }

  @Post(':sourceId/refresh')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
  })
  @ApiQuery({
    name: 'brandId',
    required: false,
    type: String,
  })
  async refreshNow(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Param('sourceId') id: string,
    @Query('brandId') brandId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (
      !idempotencyKey ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)
    ) {
      throw new BadRequestException(
        'Idempotency-Key must contain 8–128 letters, digits, dots, colons, underscores or hyphens',
      );
    }
    const actor = resolveKnowledgeActor(user, brandId);
    const result = await this.refresh.refresh(actor, id, idempotencyKey, {
      force: true,
    });
    const source = await this.records.getSource(actor, id);
    return {
      ...serializeSingle(request, KnowledgeSourceSerializer, source),
      jobId: result.jobId,
      refreshRunId: result.refreshRunId,
    };
  }

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
}
