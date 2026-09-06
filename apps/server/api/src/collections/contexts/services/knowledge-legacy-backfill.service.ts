import { hashKnowledgeContent } from '@api/collections/contexts/services/knowledge-capture.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { isIngestibleKnowledgeSourceKind } from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { KnowledgeSourceIngestWorkflowService } from '@api/collections/contexts/services/knowledge-source-ingest-workflow.service';
import {
  captureForBookmark,
  captureForLegacyContextSource,
  isHttpUrl,
  kindForLegacyCategory,
  purposeForBookmarkIntent,
  scopeForBrand,
  titleForBookmark,
} from '@api/collections/contexts/utils/knowledge-legacy.util';
import { parseKnowledgeSources } from '@api/collections/contexts/utils/knowledge-source.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type {
  KnowledgeLegacyBackfillReport,
  KnowledgeLegacyQuarantine,
} from '@genfeedai/contracts/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export const KNOWLEDGE_LEGACY_BACKFILL_ID_PREFIX = 'knowledge-legacy';

type LegacyActor = { brandId?: string; organizationId: string; userId: string };

/**
 * Moves `ContextBase.data.sources` entries and `Bookmark` rows into the
 * canonical Knowledge tables exactly once. Every migrated version records the
 * legacy identity in its provenance, so re-running finds existing sources
 * instead of creating duplicates; rows that cannot be converted safely are
 * quarantined in the report, never dropped.
 */
@Injectable()
export class KnowledgeLegacyBackfillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: KnowledgeRecordsService,
    private readonly ingestWorkflow: KnowledgeSourceIngestWorkflowService,
    private readonly logger: LoggerService,
  ) {}

  async run(organizationId: string): Promise<KnowledgeLegacyBackfillReport> {
    const fallbackUserId = await this.resolveFallbackUser(organizationId);
    const report: KnowledgeLegacyBackfillReport = {
      bookmarks: { migrated: 0, quarantined: 0, skipped: 0 },
      completedAt: '',
      contextSources: {
        migrated: 0,
        quarantined: 0,
        relinkedChunks: 0,
        skipped: 0,
      },
      organizationId,
      quarantine: [],
      spacesCreated: 0,
    };
    await this.migrateContextSources(organizationId, fallbackUserId, report);
    await this.migrateBookmarks(organizationId, report);
    report.completedAt = new Date().toISOString();
    const id = `${KNOWLEDGE_LEGACY_BACKFILL_ID_PREFIX}:${organizationId}`;
    await this.prisma.dataBackfill.upsert({
      create: { id, report: toPrismaJson(report) },
      update: { completedAt: new Date(), report: toPrismaJson(report) },
      where: { id },
    });
    this.logger.log('Knowledge legacy backfill completed', {
      bookmarks: report.bookmarks,
      contextSources: report.contextSources,
      organizationId,
      quarantined: report.quarantine.length,
    });
    return report;
  }

  private async migrateContextSources(
    organizationId: string,
    fallbackUserId: string,
    report: KnowledgeLegacyBackfillReport,
  ): Promise<void> {
    const bases = await this.prisma.contextBase.findMany({
      select: {
        createdById: true,
        data: true,
        id: true,
        sourceBrandId: true,
        updatedAt: true,
      },
      where: scopedWhere(organizationId, {}),
    });
    for (const base of bases) {
      for (const source of parseKnowledgeSources(base.data)) {
        if (source.isDeleted) {
          report.contextSources.skipped += 1;
          continue;
        }
        if (
          await this.hasMigratedVersion(
            organizationId,
            'legacySourceId',
            source.id,
          )
        ) {
          report.contextSources.skipped += 1;
          continue;
        }
        if (!isHttpUrl(source.referenceUrl)) {
          this.quarantine(report, {
            id: source.id,
            kind: 'context-source',
            reason: source.referenceUrl
              ? 'Legacy source URL is not http(s)'
              : 'Legacy source has no reference URL',
          });
          report.contextSources.quarantined += 1;
          continue;
        }
        const kind = kindForLegacyCategory(source.category);
        const actor: LegacyActor = {
          ...(base.sourceBrandId ? { brandId: base.sourceBrandId } : {}),
          organizationId,
          userId: base.createdById ?? fallbackUserId,
        };
        const capture = captureForLegacyContextSource(
          base.id,
          source,
          base.updatedAt,
        );
        const created = await this.records.createSource(actor, {
          kind,
          purpose: KnowledgeSourcePurpose.INSPIRATION,
          scope: scopeForBrand(base.sourceBrandId),
          title: source.label,
        });
        const version = await this.records.createVersion(actor, created.id, {
          contentHash: hashKnowledgeContent(source.referenceUrl),
          observedAt: capture.provenance.capturedAt,
          payload: JSON.parse(JSON.stringify(capture.payload)),
          provenance: JSON.parse(JSON.stringify(capture.provenance)),
        });
        const relinked = await this.prisma.contextEntry.updateMany({
          data: {
            knowledgeSourceId: created.id,
            knowledgeSourceVersionId: version.id,
          },
          where: scopedWhere(organizationId, {
            contextBaseId: base.id,
            data: { equals: source.id, path: ['metadata', 'sourceId'] },
            knowledgeSourceVersionId: null,
          }),
        });
        report.contextSources.relinkedChunks += relinked.count;
        report.contextSources.migrated += 1;
        if (relinked.count > 0) {
          await this.transition(
            organizationId,
            created.id,
            version.id,
            KnowledgeProcessingState.READY,
          );
          continue;
        }
        await this.enqueueOrFail(organizationId, created.id, version.id, kind);
      }
    }
  }

  private async migrateBookmarks(
    organizationId: string,
    report: KnowledgeLegacyBackfillReport,
  ): Promise<void> {
    const bookmarks = await this.prisma.bookmark.findMany({
      include: { folder: { select: { id: true, label: true } } },
      orderBy: { createdAt: 'asc' },
      where: scopedWhere(organizationId, {}),
    });
    const spaceIdByKey = new Map<string, string>();
    for (const bookmark of bookmarks) {
      if (
        await this.hasMigratedVersion(organizationId, 'bookmarkId', bookmark.id)
      ) {
        report.bookmarks.skipped += 1;
        continue;
      }
      if (!isHttpUrl(bookmark.url)) {
        this.quarantine(report, {
          id: bookmark.id,
          kind: 'bookmark',
          reason: 'Bookmark URL is not http(s)',
        });
        report.bookmarks.quarantined += 1;
        continue;
      }
      const actor: LegacyActor = {
        ...(bookmark.brandId ? { brandId: bookmark.brandId } : {}),
        organizationId,
        userId: bookmark.userId,
      };
      const scope = bookmark.brandId
        ? KnowledgeMemoryScope.BRAND
        : KnowledgeMemoryScope.PERSONAL;
      const capture = captureForBookmark(bookmark);
      const created = await this.records.createSource(actor, {
        kind: KnowledgeSourceKind.URL,
        purpose: purposeForBookmarkIntent(bookmark.intent),
        scope,
        title: titleForBookmark(bookmark),
      });
      const version = await this.records.createVersion(actor, created.id, {
        contentHash: hashKnowledgeContent(
          capture.payload.text ?? capture.payload.referenceUrl ?? bookmark.id,
        ),
        observedAt: capture.provenance.capturedAt,
        payload: JSON.parse(JSON.stringify(capture.payload)),
        provenance: JSON.parse(JSON.stringify(capture.provenance)),
      });
      if (bookmark.folder) {
        const spaceId = await this.ensureSpace(
          actor,
          scope,
          bookmark.folder.label,
          spaceIdByKey,
          report,
        );
        await this.records.setMembership(actor, created.id, spaceId, false);
      }
      report.bookmarks.migrated += 1;
      await this.ingestWorkflow.enqueueIngest({
        organizationId,
        sourceId: created.id,
        versionId: version.id,
      });
    }
  }

  /** One space per folder label inside the same scope; reused across runs. */
  private async ensureSpace(
    actor: LegacyActor,
    scope: KnowledgeMemoryScope,
    label: string,
    cache: Map<string, string>,
    report: KnowledgeLegacyBackfillReport,
  ): Promise<string> {
    const title = label.trim().slice(0, 500) || 'Bookmarks';
    const key = [scope, actor.brandId ?? '', actor.userId, title].join('|');
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const existing = await this.prisma.knowledgeSpace.findFirst({
      select: { id: true },
      where: scopedWhere(actor.organizationId, {
        brandId: actor.brandId ?? null,
        isInbox: false,
        scope,
        title,
        ...(scope === KnowledgeMemoryScope.PERSONAL
          ? { userId: actor.userId }
          : {}),
      }),
    });
    if (existing) {
      cache.set(key, existing.id);
      return existing.id;
    }
    const space = await this.records.createSpace(actor, { scope, title });
    report.spacesCreated += 1;
    cache.set(key, space.id);
    return space.id;
  }

  private async hasMigratedVersion(
    organizationId: string,
    key: 'bookmarkId' | 'legacySourceId',
    value: string,
  ): Promise<boolean> {
    const existing = await this.prisma.knowledgeSourceVersion.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        provenance: { equals: value, path: [key] },
      }),
    });
    return Boolean(existing);
  }

  /**
   * Versions start QUEUED; the database only allows READY or FAILED from
   * PROCESSING, so the backfill walks the same two steps ingestion does.
   */
  private async transition(
    organizationId: string,
    sourceId: string,
    versionId: string,
    state: KnowledgeProcessingState.FAILED | KnowledgeProcessingState.READY,
    processingError?: string,
  ): Promise<void> {
    await this.prisma.knowledgeSourceVersion.updateMany({
      data: { processingState: KnowledgeProcessingState.PROCESSING },
      where: scopedWhere(organizationId, { id: versionId, sourceId }),
    });
    await this.prisma.knowledgeSourceVersion.updateMany({
      data: {
        processingError:
          state === KnowledgeProcessingState.FAILED
            ? (processingError ?? 'Ingestion failed')
            : null,
        processingState: state,
      },
      where: scopedWhere(organizationId, { id: versionId, sourceId }),
    });
  }

  private async enqueueOrFail(
    organizationId: string,
    sourceId: string,
    versionId: string,
    kind: KnowledgeSourceKind,
  ): Promise<void> {
    if (isIngestibleKnowledgeSourceKind(kind)) {
      await this.ingestWorkflow.enqueueIngest({
        organizationId,
        sourceId,
        versionId,
      });
      return;
    }
    await this.transition(
      organizationId,
      sourceId,
      versionId,
      KnowledgeProcessingState.FAILED,
      `${kind} sources are not ingested yet`,
    );
  }

  private quarantine(
    report: KnowledgeLegacyBackfillReport,
    entry: KnowledgeLegacyQuarantine,
  ): void {
    report.quarantine.push(entry);
  }

  /** Legacy context bases may have no author; the oldest member owns them. */
  private async resolveFallbackUser(organizationId: string): Promise<string> {
    const member = await this.prisma.member.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
      where: scopedWhere(organizationId, {}),
    });
    if (!member) {
      throw new NotFoundException('Organization member', organizationId);
    }
    return member.userId;
  }
}
