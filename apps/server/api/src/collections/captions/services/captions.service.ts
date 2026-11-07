import { CreateCaptionDto } from '@api/collections/captions/dto/create-caption.dto';
import { UpdateCaptionDto } from '@api/collections/captions/dto/update-caption.dto';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { Caption } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CaptionsService extends BaseService<
  Caption,
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
