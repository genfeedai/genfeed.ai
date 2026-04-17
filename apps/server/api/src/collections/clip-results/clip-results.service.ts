import { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
import { UpdateClipResultDto } from '@api/collections/clip-results/dto/update-clip-result.dto';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ClipResultsService extends BaseService<
  ClipResultDocument,
  CreateClipResultDto,
  UpdateClipResultDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'clipResult', logger);
  }

  findByProject(projectId: string): Promise<ClipResultDocument[]> {
    return this.delegate.findMany({
      where: {
        isDeleted: false,
        projectId,
      },
      orderBy: { viralityScore: 'desc' },
    }) as Promise<ClipResultDocument[]>;
  }

  findByProviderJobId(
    providerJobId: string,
  ): Promise<ClipResultDocument | null> {
    return this.delegate.findFirst({
      where: {
        isDeleted: false,
        providerJobId,
      },
    }) as Promise<ClipResultDocument | null>;
  }
}
