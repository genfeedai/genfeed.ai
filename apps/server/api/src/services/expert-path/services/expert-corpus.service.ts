import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeProcessingState,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

export interface ExpertCorpusSummary {
  sourceCount: number;
  readySourceIds: string[];
}

/**
 * The expert's corpus is their brand-scoped `BRAND_TRUTH` knowledge — the
 * existing purpose prompts already treat as authoritative.
 */
@Injectable()
export class ExpertCorpusService {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(
    organizationId: string,
    brandId: string,
  ): Promise<ExpertCorpusSummary> {
    const sources = await this.prisma.knowledgeSource.findMany({
      select: {
        id: true,
        versions: {
          select: { processingState: true },
          take: 1,
          where: { isCurrent: true, isDeleted: false },
        },
      },
      where: scopedWhere(organizationId, {
        brandId,
        purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      }),
    });

    return {
      readySourceIds: sources
        .filter(
          (source) =>
            source.versions[0]?.processingState ===
            KnowledgeProcessingState.READY,
        )
        .map((source) => source.id),
      sourceCount: sources.length,
    };
  }
}
