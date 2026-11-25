import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningPublicationDependencyRefsV1 } from '@api/collections/content-learning/services/learning-publication-source.projection';
import type { LearningPublicationSourceV1 } from '@api/collections/content-learning/services/learning-publication-source.types';
import {
  isLearningGlobalDependencyKind,
  type LearningDependencyRefV1,
  validLearningDependencyRef,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { Prisma } from '@genfeedai/prisma';
import { traced } from '@libs/tracing/traced';
import { ConflictException } from '@nestjs/common';

const edgeKey = (kind: string, id: string, version: string) =>
  JSON.stringify([kind, id, version]);

/**
 * Links every canonical edge of one publication source to `derived` in a fixed
 * number of queries, however many edges the source has.
 *
 * `LearningDependencyService.link` re-reads each source's pin, and the post,
 * approval and finalization pins each re-resolve the whole publication, so the
 * eight canonical edges cost about fifty-five queries. Inside the capture
 * transaction that passes Prisma's five second budget (#11216). Here the source
 * pins are the ones the caller already resolved: `source` MUST be a value read
 * through `resolveLearningPublicationSourceV1` on this same `tx`. Only the
 * derived pin is read again. Edges that exist are returned unchanged and the
 * rest are created together, so a failure rolls back with the caller's
 * transaction.
 */
export const linkLearningPublicationSource = traced(
  'linkLearningPublicationSource',
  async (
    dependencies: LearningDependencyService,
    tx: Prisma.TransactionClient,
    source: LearningPublicationSourceV1,
    derived: LearningDependencyRefV1,
  ) => {
    const sources = learningPublicationDependencyRefsV1(source);
    if (
      !validLearningDependencyRef(derived) ||
      !sources.every((ref) => validLearningDependencyRef(ref))
    )
      throw new ConflictException('Invalid dependency identity');
    const pinned = await dependencies.resolve(
      derived.kind,
      derived.id,
      derived.organizationId,
      tx,
    );
    if (pinned.version !== derived.version)
      throw new ConflictException('Pinned dependency version mismatch');
    for (const ref of sources)
      if (
        !isLearningGlobalDependencyKind(ref.kind) &&
        !isLearningGlobalDependencyKind(derived.kind) &&
        ref.organizationId !== derived.organizationId
      )
        throw new ConflictException('Cross-tenant dependency forbidden');
    const where = {
      derivedId: derived.id,
      derivedKind: derived.kind,
      OR: sources.map((ref) => ({
        sourceId: ref.id,
        sourceKind: ref.kind,
        sourceVersion: ref.version,
      })),
    };
    const read = () =>
      tx.contentLearningDependency.findMany({ take: sources.length, where });
    const existing = await read();
    const known = new Set(
      existing.map((edge) =>
        edgeKey(edge.sourceKind, edge.sourceId, edge.sourceVersion),
      ),
    );
    const missing = sources.filter(
      (ref) => !known.has(edgeKey(ref.kind, ref.id, ref.version)),
    );
    if (missing.length > 0)
      await tx.contentLearningDependency.createMany({
        data: missing.map((ref) => ({
          derivedId: derived.id,
          derivedKind: derived.kind,
          derivedOrganizationId: derived.organizationId,
          sourceId: ref.id,
          sourceKind: ref.kind,
          sourceOrganizationId: ref.organizationId,
          sourceVersion: ref.version,
        })),
        skipDuplicates: true,
      });
    const edges = missing.length > 0 ? await read() : existing;
    return sources.map((ref) => {
      const edge = edges.find(
        (row) =>
          row.sourceKind === ref.kind &&
          row.sourceId === ref.id &&
          row.sourceVersion === ref.version,
      );
      if (!edge) throw new ConflictException('Dependency edge unavailable');
      if (
        edge.sourceOrganizationId !== ref.organizationId ||
        edge.derivedOrganizationId !== derived.organizationId
      )
        throw new ConflictException('Dependency scope conflict');
      return edge;
    });
  },
);
