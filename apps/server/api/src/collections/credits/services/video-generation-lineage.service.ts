import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Prisma } from '@genfeedai/prisma';
import type {
  VideoGenerationAttemptKind,
  VideoGenerationCreditMetadata,
} from '@genfeedai/workflows/engine';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export const VIDEO_GENERATION_LINEAGE_REFERENCE_TYPE =
  'video-generation-lineage';

export type VideoGenerationLineageLedgerEntry = {
  amount: number;
  metadata?: unknown;
};

export function buildVideoGenerationLineageMetadata(
  metadata: VideoGenerationCreditMetadata,
): Record<string, unknown> {
  return {
    accepted: metadata.accepted,
    attemptKind: metadata.attemptKind,
    attemptNumber: metadata.attemptNumber,
    lineageId: metadata.lineageId,
  };
}

export function buildVideoGenerationLineageReferenceId(
  lineageId: string,
  attemptKind: VideoGenerationAttemptKind,
  attemptNumber: number,
): string {
  return `${lineageId}:${attemptKind}:${attemptNumber}`;
}

export function parseVideoGenerationLineageMetadata(
  metadata: unknown,
): VideoGenerationCreditMetadata | null {
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  ) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const lineageId = record.lineageId;
  const attemptKind = record.attemptKind;
  const attemptNumber = record.attemptNumber;
  const accepted = record.accepted;

  if (typeof lineageId !== 'string' || lineageId.length === 0) {
    return null;
  }
  if (attemptKind !== 'pilot' && attemptKind !== 'full') {
    return null;
  }
  if (typeof attemptNumber !== 'number' || !Number.isFinite(attemptNumber)) {
    return null;
  }
  if (accepted !== true && accepted !== false && accepted !== null) {
    return null;
  }

  return {
    accepted,
    attemptKind,
    attemptNumber,
    lineageId,
  };
}

export function sumVideoGenerationLineageSpend(
  entries: VideoGenerationLineageLedgerEntry[],
  lineageId: string,
): number {
  return entries.reduce((total, entry) => {
    const parsed = parseVideoGenerationLineageMetadata(entry.metadata);
    if (parsed?.lineageId !== lineageId) {
      return total;
    }
    return total + (Number.isFinite(entry.amount) ? entry.amount : 0);
  }, 0);
}

@Injectable()
export class VideoGenerationLineageService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  async listByLineageId(
    organizationId: string,
    lineageId: string,
  ): Promise<VideoGenerationLineageLedgerEntry[]> {
    const trimmedLineageId = lineageId.trim();
    if (!organizationId || !trimmedLineageId) {
      this.loggerService.warn(
        `${this.constructorName} listByLineageId missing identity`,
        { lineageId, organizationId },
      );
      return [];
    }

    const rows = await this.prisma.creditTransaction.findMany({
      orderBy: { createdAt: 'asc' },
      where: scopedWhere(organizationId, {
        metadata: {
          equals: trimmedLineageId,
          path: ['lineageId'],
        } satisfies Prisma.JsonFilter,
      }),
    });

    return rows.map((row) => ({
      amount: row.amount,
      metadata: row.metadata,
    }));
  }

  async sumSpendByLineageId(
    organizationId: string,
    lineageId: string,
  ): Promise<number> {
    const entries = await this.listByLineageId(organizationId, lineageId);
    return sumVideoGenerationLineageSpend(entries, lineageId);
  }
}
