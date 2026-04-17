import { CreateClipProjectDto } from '@api/collections/clip-projects/dto/create-clip-project.dto';
import { UpdateClipProjectDto } from '@api/collections/clip-projects/dto/update-clip-project.dto';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ClipProjectsService extends BaseService<
  ClipProjectDocument,
  CreateClipProjectDto,
  UpdateClipProjectDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'clipProject', logger);
  }
}
