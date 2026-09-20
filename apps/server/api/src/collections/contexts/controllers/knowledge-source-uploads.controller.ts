import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { KNOWLEDGE_CAPTURE_TEXT_MAX_LENGTH } from '@api/collections/contexts/dto/create-knowledge-source.dto';
import { UploadKnowledgeSourceDto } from '@api/collections/contexts/dto/upload-knowledge-source.dto';
import { KnowledgeCaptureService } from '@api/collections/contexts/services/knowledge-capture.service';
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
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { KnowledgeSourceKind } from '@genfeedai/contracts';
import { KnowledgeSourceSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
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

/**
 * File uploads for Knowledge, split from `KnowledgeSourcesController` so the
 * multipart surface carries its own interceptor and validation pipe.
 */
@AutoSwagger()
@ApiBearerAuth()
@Controller('knowledge-sources')
export class KnowledgeSourceUploadsController {
  constructor(private readonly capture: KnowledgeCaptureService) {}

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
}
