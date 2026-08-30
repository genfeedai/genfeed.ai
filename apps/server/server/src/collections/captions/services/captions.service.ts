import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { CreateCaptionDto } from '@server/collections/captions/dto/create-caption.dto';
import { UpdateCaptionDto } from '@server/collections/captions/dto/update-caption.dto';
import type { CaptionDocument } from '@server/collections/captions/schemas/caption.schema';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { BaseService } from '@server/shared/services/base/base.service';

@Injectable()
export class CaptionsService extends BaseService<
  CaptionDocument,
  CreateCaptionDto,
  UpdateCaptionDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'caption', logger);
  }
}
