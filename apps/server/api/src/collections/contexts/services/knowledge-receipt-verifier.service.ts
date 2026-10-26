import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeProcessingState,
  KnowledgeRetentionState,
  KnowledgeRetrievalState,
  type KnowledgeSourceKind,
  type KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { KnowledgeReceipt } from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * Re-checks a passage the model was shown against what the actor may read now.
 * A receipt only survives when its exact version is still the current, ready,
 * active and retained one and its source is still visible to this actor, so a
 * correction, deletion, hiding or scope change between retrieval and the end of
 * the turn drops the citation instead of showing stale evidence.
 */
@Injectable()
export class KnowledgeReceiptVerifierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: KnowledgeRecordsService,
  ) {}

  async revalidate(
    actor: KnowledgeActor,
    receipt: Readonly<KnowledgeReceipt>,
    now: Date = new Date(),
  ): Promise<KnowledgeReceipt | null> {
    const source = await this.prisma.knowledgeSource.findFirst({
      select: { id: true, kind: true, purpose: true, title: true },
      where: scopedWhere(actor.organizationId, {
        ...(await this.records.ownership(actor)),
        id: receipt.sourceId,
        isVisible: true,
      }),
    });
    if (!source) return null;

    const version = await this.prisma.knowledgeSourceVersion.findFirst({
      select: { id: true, version: true },
      where: scopedWhere(actor.organizationId, {
        id: receipt.versionId,
        isCurrent: true,
        isDeleted: false,
        processingState: KnowledgeProcessingState.READY,
        retentionState: KnowledgeRetentionState.RETAINED,
        retrievalState: KnowledgeRetrievalState.ACTIVE,
        sourceId: source.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      }),
    });
    if (!version) return null;

    return {
      ...receipt,
      kind: source.kind as KnowledgeSourceKind,
      purpose: source.purpose as KnowledgeSourcePurpose,
      sourceId: source.id,
      title: source.title,
      version: version.version,
      versionId: version.id,
    };
  }
}
