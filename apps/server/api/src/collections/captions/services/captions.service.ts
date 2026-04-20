import { CreateCaptionDto } from '@api/collections/captions/dto/create-caption.dto';
import { UpdateCaptionDto } from '@api/collections/captions/dto/update-caption.dto';
import type { CaptionDocument } from '@api/collections/captions/schemas/caption.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CaptionsService extends BaseService<
  CaptionDocument,
  CreateCaptionDto,
  UpdateCaptionDto
> {
  public readonly constructorName: string = String(this.constructor.name);

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'caption', logger);
  }
}
