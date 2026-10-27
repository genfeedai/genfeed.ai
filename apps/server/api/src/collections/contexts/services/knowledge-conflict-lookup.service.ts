import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  KnowledgeConflictStatus,
  KnowledgeProcessingState,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
} from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

/** Open conflicts returned for one lookup; a long list is not a useful answer. */
export const MAX_CONFLICTS_PER_LOOKUP = 10;

export interface KnowledgeConflictSide {
  excerpt: string;
  sourceId: string;
  title: string;
  version: number;
  versionId: string;
}

export interface OpenKnowledgeConflict {
  a: KnowledgeConflictSide;
  b: KnowledgeConflictSide;
  id: string;
  summary: string;
}

/**
 * Open conflicts that involve any of the given Knowledge versions. A conflict
 * is returned only while both of its versions are still the current, ready,
 * active and retained ones, so correcting, hiding or replacing either source
 * makes the conflict disappear without any bookkeeping.
 */
@Injectable()
export class KnowledgeConflictLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async findOpenForVersions(
    organizationId: string,
    versionIds: string[],
    now: Date = new Date(),
  ): Promise<OpenKnowledgeConflict[]> {
    const unique = [...new Set(versionIds)];
    if (unique.length === 0) return [];

    const eligibleVersion = {
      isCurrent: true,
      isDeleted: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      processingState: KnowledgeProcessingState.READY,
      retentionState: KnowledgeRetentionState.RETAINED,
      retrievalState: KnowledgeRetrievalState.ACTIVE,
      source: { isDeleted: false, isVisible: true },
    };
    const include = {
      select: { id: true, version: true, source: { select: { title: true } } },
    };
    const rows = await this.prisma.knowledgeSourceConflict.findMany({
      orderBy: [{ judgedAt: 'desc' }, { id: 'asc' }],
      select: {
        excerptA: true,
        excerptB: true,
        id: true,
        sourceAId: true,
        sourceBId: true,
        summary: true,
        versionA: include,
        versionB: include,
      },
      take: MAX_CONFLICTS_PER_LOOKUP,
      where: scopedWhere(organizationId, {
        OR: [{ versionAId: { in: unique } }, { versionBId: { in: unique } }],
        status: KnowledgeConflictStatus.OPEN,
        versionA: { is: eligibleVersion },
        versionB: { is: eligibleVersion },
      }),
    });

    return rows.flatMap((row) =>
      row.summary && row.excerptA && row.excerptB
        ? [
            {
              a: {
                excerpt: row.excerptA,
                sourceId: row.sourceAId,
                title: row.versionA.source.title,
                version: row.versionA.version,
                versionId: row.versionA.id,
              },
              b: {
                excerpt: row.excerptB,
                sourceId: row.sourceBId,
                title: row.versionB.source.title,
                version: row.versionB.version,
                versionId: row.versionB.id,
              },
              id: row.id,
              summary: row.summary,
            },
          ]
        : [],
    );
  }
}
