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
  learningPublicationApprovalSelect,
  learningPublicationBrandSelect,
  learningPublicationCredentialSelect,
  learningPublicationFinalizationSelect,
  learningPublicationOrganizationSelect,
  learningPublicationPinSelect,
  learningPublicationPostSelect,
} from '@api/collections/content-learning/services/learning-publication-source.types';
import type { LearningDependencyKindV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { Prisma } from '@genfeedai/prisma';

const key = (organizationId: string, kind: string, sourceId: string) =>
  JSON.stringify([organizationId, kind, sourceId]);

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

  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly batchSize: number,
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
              part.includes(row.id) &&
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
              part.includes(row.id) &&
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
      if (kind === 'content_version_pin') {
        const rows = await this.tx.contentVersionPin.findMany({
          where: { id: { in: part }, organizationId },
          select: { id: true, organizationId: true, contentDigest: true },
        });
        const found = new Map(
          rows
            .filter(
              (row) =>
                part.includes(row.id) && row.organizationId === organizationId,
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
            await this.tx.publishApproval.findMany({
              where: { id: { in: part }, organizationId },
              select: learningPublicationApprovalSelect,
            })
          ).filter(
            (row) =>
              part.includes(row.id) && row.organizationId === organizationId,
          );
        if (kind === 'post_publish_finalization')
          finalizations = (
            await this.tx.postPublishFinalization.findMany({
              where: { id: { in: part }, organizationId },
              select: learningPublicationFinalizationSelect,
            })
          ).filter(
            (row) =>
              part.includes(row.id) && row.organizationId === organizationId,
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
      const posts = (
        await this.tx.post.findMany({
          where: { id: { in: part }, organizationId, isDeleted: false },
          select: learningPublicationPostSelect,
        })
      ).filter(
        (row) =>
          part.includes(row.id) &&
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
          .filter((row) => part.includes(row.postId))
          .map((row) => [row.id, row]),
      );
      const approvalIds = posts.flatMap((row) =>
        id(row.publishApprovalId) && !approvals.has(row.publishApprovalId)
          ? [row.publishApprovalId]
          : [],
      );
      for (const missing of this.parts(approvalIds)) {
        const rows = await this.tx.publishApproval.findMany({
          where: { id: { in: missing }, organizationId },
          select: learningPublicationApprovalSelect,
        });
        for (const row of rows)
          if (missing.includes(row.id) && row.organizationId === organizationId)
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
        const rows = await this.tx.contentVersionPin.findMany({
          where: { id: { in: missing }, organizationId },
          select: learningPublicationPinSelect,
        });
        for (const row of rows)
          if (
            missing.includes(row.id) &&
            row.organizationId === organizationId
          ) {
            pins.set(row.id, row);
            this.values.set(
              key(organizationId, 'content_version_pin', row.id),
              row.contentDigest || null,
            );
          }
      }
      const finalizations = new Map(
        entryFinalizations
          .filter((row) => part.includes(row.postId))
          .map((row) => [row.postId, row]),
      );
      for (const missing of this.parts(
        posts.filter((row) => !finalizations.has(row.id)).map((row) => row.id),
      )) {
        const rows = await this.tx.postPublishFinalization.findMany({
          where: { postId: { in: missing }, organizationId },
          select: learningPublicationFinalizationSelect,
        });
        for (const row of rows)
          if (
            missing.includes(row.postId) &&
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
