import {
  id,
  learningPublicationPostEligible,
  projectLearningPublicationSourceV1,
} from '@api/collections/content-learning/services/learning-publication-source.projection';
import {
  type LearningPublicationApprovalRow,
  type LearningPublicationBrandRow,
  type LearningPublicationCredentialRow,
  type LearningPublicationFinalizationRow,
  type LearningPublicationOrganizationRow,
  type LearningPublicationPinRow,
  type LearningPublicationPostRow,
  learningPublicationApprovalSelect,
  learningPublicationBrandSelect,
  learningPublicationCredentialSelect,
  learningPublicationFinalizationSelect,
  learningPublicationOrganizationSelect,
  learningPublicationPinSelect,
  learningPublicationPostScalarSelect,
  learningPublicationPostSelect,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import type { LearningDependencyKindV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { Prisma } from '@genfeedai/prisma';

const key = (organizationId: string, kind: string, sourceId: string) =>
  `${organizationId}\u0000${kind}\u0000${sourceId}`;

export class LearningDatasetPublicationPins {
  private readonly values = new Map<string, string | null>();
  private readonly organizations = new Map<
    string,
    LearningPublicationOrganizationRow | null
  >();
  private readonly brands = new Map<
    string,
    LearningPublicationBrandRow | null
  >();
  private readonly credentials = new Map<
    string,
    LearningPublicationCredentialRow | null
  >();

  // `isBulk` reads whole batches with `= ANY(array)` SQL; the default reads through the
  // Prisma delegates the shared resolver relies on.
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly batchSize: number,
    private readonly isBulk = false,
  ) {}

  private *parts(ids: readonly string[]) {
    const unique = [...new Set(ids)];
    for (let offset = 0; offset < unique.length; offset += this.batchSize)
      yield unique.slice(offset, offset + this.batchSize);
  }

  private async organization(organizationId: string) {
    if (!this.organizations.has(organizationId)) {
      const rows = await this.tx.organization.findMany({
        where: { id: organizationId, isDeleted: false },
        select: learningPublicationOrganizationSelect,
      });
      this.organizations.set(
        organizationId,
        rows.find((row) => row.id === organizationId && !row.isDeleted) ?? null,
      );
    }
    return this.organizations.get(organizationId) ?? null;
  }

  private async loadBrands(ids: string[], organizationId: string) {
    for (const part of this.parts(
      ids.filter(
        (sourceId) => !this.brands.has(key(organizationId, 'brand', sourceId)),
      ),
    )) {
      const partIds = new Set(part);
      const rows = await this.tx.brand.findMany({
        where: {
          id: { in: part },
          organizationId,
          isDeleted: false,
          isActive: true,
        },
        select: learningPublicationBrandSelect,
      });
      const found = new Map(
        rows
          .filter(
            (row) =>
              partIds.has(row.id) &&
              row.organizationId === organizationId &&
              !row.isDeleted &&
              row.isActive,
          )
          .map((row) => [row.id, row]),
      );
      for (const sourceId of part)
        this.brands.set(
          key(organizationId, 'brand', sourceId),
          found.get(sourceId) ?? null,
        );
    }
  }

  private async loadCredentials(ids: string[], organizationId: string) {
    for (const part of this.parts(
      ids.filter(
        (sourceId) =>
          !this.credentials.has(key(organizationId, 'credential', sourceId)),
      ),
    )) {
      const partIds = new Set(part);
      const rows = await this.tx.credential.findMany({
        where: {
          id: { in: part },
          organizationId,
          isDeleted: false,
          isConnected: true,
        },
        select: learningPublicationCredentialSelect,
      });
      const found = new Map(
        rows
          .filter(
            (row) =>
              partIds.has(row.id) &&
              row.organizationId === organizationId &&
              !row.isDeleted &&
              row.isConnected,
          )
          .map((row) => [row.id, row]),
      );
      for (const sourceId of part)
        this.credentials.set(
          key(organizationId, 'credential', sourceId),
          found.get(sourceId) ?? null,
        );
    }
  }

  async pins(
    kind: LearningDependencyKindV1,
    ids: string[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!organizationId.trim()) return result;
    for (const part of this.parts(
      ids.filter(
        (sourceId) => !this.values.has(key(organizationId, kind, sourceId)),
      ),
    )) {
      const partIds = new Set(part);
      if (kind === 'content_version_pin') {
        const rows = await this.readPins(part, organizationId, {
          id: true,
          organizationId: true,
          contentDigest: true,
        });
        const found = new Map(
          rows
            .filter(
              (row) =>
                partIds.has(row.id) && row.organizationId === organizationId,
            )
            .map((row) => [row.id, row.contentDigest || null]),
        );
        for (const sourceId of part)
          this.values.set(
            key(organizationId, kind, sourceId),
            found.get(sourceId) ?? null,
          );
      } else if (
        kind === 'organization' ||
        kind === 'brand' ||
        kind === 'credential'
      ) {
        const organization = await this.organization(organizationId);
        if (organization && kind === 'brand')
          await this.loadBrands(part, organizationId);
        if (organization && kind === 'credential') {
          await this.loadCredentials(part, organizationId);
          await this.loadBrands(
            part.flatMap((sourceId) => {
              const row = this.credentials.get(
                key(organizationId, 'credential', sourceId),
              );
              return row?.brandId?.trim() ? [row.brandId] : [];
            }),
            organizationId,
          );
        }
        for (const sourceId of part) {
          let pin: string | null = null;
          if (organization) {
            if (kind === 'organization' && sourceId === organizationId)
              pin = sourceId;
            if (
              kind === 'brand' &&
              this.brands.get(key(organizationId, kind, sourceId))
            )
              pin = sourceId;
            if (kind === 'credential') {
              const row = this.credentials.get(
                key(organizationId, kind, sourceId),
              );
              if (
                row?.brandId?.trim() &&
                this.brands.get(key(organizationId, 'brand', row.brandId))
              )
                pin = sourceId;
            }
          }
          this.values.set(key(organizationId, kind, sourceId), pin);
        }
      } else {
        let approvals: LearningPublicationApprovalRow[] = [];
        let finalizations: LearningPublicationFinalizationRow[] = [];
        if (kind === 'publish_approval')
          approvals = (
            await this.readApprovals('id', part, organizationId)
          ).filter(
            (row) =>
              partIds.has(row.id) && row.organizationId === organizationId,
          );
        if (kind === 'post_publish_finalization')
          finalizations = (
            await this.readFinalizations('id', part, organizationId)
          ).filter(
            (row) =>
              partIds.has(row.id) && row.organizationId === organizationId,
          );
        const postIds =
          kind === 'post'
            ? part
            : kind === 'publish_approval'
              ? approvals.map((row) => row.postId)
              : finalizations.map((row) => row.postId);
        await this.loadPosts(postIds, organizationId, approvals, finalizations);
        for (const sourceId of part)
          if (!this.values.has(key(organizationId, kind, sourceId)))
            this.values.set(key(organizationId, kind, sourceId), null);
      }
    }
    for (const sourceId of ids) {
      const pin = this.values.get(key(organizationId, kind, sourceId));
      if (pin) result.set(sourceId, pin);
    }
    return result;
  }

  // One array bind per batch instead of one bind per id.
  private byColumn<T>(
    table: string,
    select: Record<string, true>,
    column: 'id' | 'postId',
    ids: string[],
    organizationId: string,
  ) {
    return this.tx.$queryRaw<T[]>(Prisma.sql`
      SELECT ${Prisma.raw(
        Object.keys(select)
          .map((name) => `"${name}"`)
          .join(', '),
      )} FROM ${Prisma.raw(table)}
      WHERE ${Prisma.raw(`"${column}"`)} = ANY(${ids}::text[]) AND "organizationId" = ${organizationId}`);
  }

  private readApprovals(
    column: 'id' | 'postId',
    ids: string[],
    organizationId: string,
  ): Promise<LearningPublicationApprovalRow[]> {
    return this.isBulk
      ? this.byColumn(
          'publish_approvals',
          learningPublicationApprovalSelect,
          column,
          ids,
          organizationId,
        )
      : this.tx.publishApproval.findMany({
          where: { [column]: { in: ids }, organizationId },
          select: learningPublicationApprovalSelect,
        });
  }

  private readPins(
    ids: string[],
    organizationId: string,
    select: Partial<
      typeof learningPublicationPinSelect
    > = learningPublicationPinSelect,
  ): Promise<LearningPublicationPinRow[]> {
    return this.isBulk
      ? this.byColumn(
          'content_version_pins',
          learningPublicationPinSelect,
          'id',
          ids,
          organizationId,
        )
      : (this.tx.contentVersionPin.findMany({
          where: { id: { in: ids }, organizationId },
          select,
        }) as Promise<LearningPublicationPinRow[]>);
  }

  private readFinalizations(
    column: 'id' | 'postId',
    ids: string[],
    organizationId: string,
  ): Promise<LearningPublicationFinalizationRow[]> {
    return this.isBulk
      ? this.byColumn(
          'post_publish_finalizations',
          learningPublicationFinalizationSelect,
          column,
          ids,
          organizationId,
        )
      : this.tx.postPublishFinalization.findMany({
          where: { [column]: { in: ids }, organizationId },
          select: learningPublicationFinalizationSelect,
        });
  }

  // Prisma `_count` joins aggregate the whole posts/_post_ingredients tables per batch;
  // counting only the batch's ids keeps each read proportional to the batch.
  private async loadPostRows(
    part: string[],
    organizationId: string,
  ): Promise<LearningPublicationPostRow[]> {
    if (!this.isBulk)
      return this.tx.post.findMany({
        where: { id: { in: part }, organizationId, isDeleted: false },
        select: learningPublicationPostSelect,
      });
    const rows = await this.tx.post.findMany({
      where: { id: { in: part }, organizationId, isDeleted: false },
      select: learningPublicationPostScalarSelect,
    });
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const counts = await this.tx.$queryRaw<
      Array<{ postId: string; ingredients: number; children: number }>
    >(Prisma.sql`
      SELECT "postId", SUM(ingredients)::int AS ingredients, SUM(children)::int AS children FROM (
        SELECT pi."B" AS "postId", 1 AS ingredients, 0 AS children
        FROM "_post_ingredients" pi JOIN ingredients ing ON ing.id = pi."A"
        WHERE pi."B" = ANY(${ids}::text[])
        UNION ALL
        SELECT "parentId" AS "postId", 0, 1 FROM posts
        WHERE "parentId" = ANY(${ids}::text[]) AND NOT "isDeleted"
      ) counted GROUP BY "postId"`);
    const byPost = new Map(counts.map((row) => [row.postId, row]));
    return rows.map((row) => ({
      ...row,
      _count: {
        ingredients: byPost.get(row.id)?.ingredients ?? 0,
        children: byPost.get(row.id)?.children ?? 0,
      },
    }));
  }

  private async loadPosts(
    ids: string[],
    organizationId: string,
    entryApprovals: LearningPublicationApprovalRow[],
    entryFinalizations: LearningPublicationFinalizationRow[],
  ) {
    for (const part of this.parts(
      ids.filter(
        (sourceId) => !this.values.has(key(organizationId, 'post', sourceId)),
      ),
    )) {
      const partIds = new Set(part);
      const posts = (await this.loadPostRows(part, organizationId)).filter(
        (row) =>
          partIds.has(row.id) &&
          learningPublicationPostEligible(row, organizationId, row.id),
      );
      const organization = await this.organization(organizationId);
      await this.loadBrands(
        posts.map((row) => row.brandId),
        organizationId,
      );
      await this.loadCredentials(
        posts.flatMap((row) =>
          id(row.credentialId) ? [row.credentialId] : [],
        ),
        organizationId,
      );
      const approvals = new Map(
        entryApprovals
          .filter((row) => partIds.has(row.postId))
          .map((row) => [row.id, row]),
      );
      const approvalIds = posts.flatMap((row) =>
        id(row.publishApprovalId) && !approvals.has(row.publishApprovalId)
          ? [row.publishApprovalId]
          : [],
      );
      for (const missing of this.parts(approvalIds)) {
        const missingIds = new Set(missing);
        const rows = await this.readApprovals('id', missing, organizationId);
        for (const row of rows)
          if (missingIds.has(row.id) && row.organizationId === organizationId)
            approvals.set(row.id, row);
      }
      const pins = new Map<
        string,
        Prisma.ContentVersionPinGetPayload<{
          select: typeof learningPublicationPinSelect;
        }>
      >();
      for (const missing of this.parts(
        posts.flatMap((row) =>
          id(row.reviewVersionPinId) ? [row.reviewVersionPinId] : [],
        ),
      )) {
        const missingIds = new Set(missing);
        const rows = await this.readPins(missing, organizationId);
        for (const row of rows)
          if (missingIds.has(row.id) && row.organizationId === organizationId) {
            pins.set(row.id, row);
            this.values.set(
              key(organizationId, 'content_version_pin', row.id),
              row.contentDigest || null,
            );
          }
      }
      const finalizations = new Map(
        entryFinalizations
          .filter((row) => partIds.has(row.postId))
          .map((row) => [row.postId, row]),
      );
      for (const missing of this.parts(
        posts.filter((row) => !finalizations.has(row.id)).map((row) => row.id),
      )) {
        const missingIds = new Set(missing);
        const rows = await this.readFinalizations(
          'postId',
          missing,
          organizationId,
        );
        for (const row of rows)
          if (
            missingIds.has(row.postId) &&
            row.organizationId === organizationId
          )
            finalizations.set(row.postId, row);
      }
      for (const post of posts) {
        const source = projectLearningPublicationSourceV1(
          organizationId,
          post.id,
          {
            post,
            organization,
            brand:
              this.brands.get(key(organizationId, 'brand', post.brandId)) ??
              null,
            credential: post.credentialId
              ? (this.credentials.get(
                  key(organizationId, 'credential', post.credentialId),
                ) ?? null)
              : null,
            approval: post.publishApprovalId
              ? (approvals.get(post.publishApprovalId) ?? null)
              : null,
            pin: post.reviewVersionPinId
              ? (pins.get(post.reviewVersionPinId) ?? null)
              : null,
            finalization: finalizations.get(post.id) ?? null,
          },
        );
        this.values.set(
          key(organizationId, 'post', post.id),
          source?.postSourceVersion ?? null,
        );
        if (source) {
          this.values.set(
            key(organizationId, 'publish_approval', source.approvalId),
            source.approvalVersion,
          );
          this.values.set(
            key(
              organizationId,
              'post_publish_finalization',
              source.finalizationId,
            ),
            source.finalizationVersion,
          );
        }
      }
      for (const sourceId of part)
        if (!this.values.has(key(organizationId, 'post', sourceId)))
          this.values.set(key(organizationId, 'post', sourceId), null);
    }
  }
}
