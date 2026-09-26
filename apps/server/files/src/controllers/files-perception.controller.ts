import { MediaPerceptionArtefactsService } from '@files/services/perception/media-perception-artefacts.service';
import {
  type MediaPerceptionArtefacts,
  type MediaPerceptionFingerprint,
  mediaPerceptionArtefactsRequestSchema,
  mediaPerceptionFingerprintRequestSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { ZodType } from 'zod';

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues.map((issue) => issue.message).join('; '),
    );
  }
  return parsed.data;
}

/**
 * Model-free media perception artefacts (#4879). The API fingerprints an asset
 * first and only requests artefacts for bytes it has not perceived before.
 */
@Controller('files')
export class FilesPerceptionController {
  constructor(
    private readonly mediaPerceptionArtefactsService: MediaPerceptionArtefactsService,
  ) {}

  @Post('perception/fingerprint')
  async fingerprint(
    @Body() body: unknown,
  ): Promise<MediaPerceptionFingerprint> {
    const request = parseBody(mediaPerceptionFingerprintRequestSchema, body);
    return this.mediaPerceptionArtefactsService.fingerprint(request.url);
  }

  @Post('perception/artefacts')
  async artefacts(@Body() body: unknown): Promise<MediaPerceptionArtefacts> {
    const request = parseBody(mediaPerceptionArtefactsRequestSchema, body);
    return this.mediaPerceptionArtefactsService.extract(request);
  }
}
