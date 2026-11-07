import type { LearningQueryDto } from '@api/collections/content-learning/dto/learning-query.dto';
import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { buildPaginatedResult } from '@api/helpers/utils/paginated-result/paginated-result.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { ContentLearningRunStatus as RunStatus } from '@genfeedai/contracts';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

type LearningPage = Pick<LearningQueryDto, 'limit' | 'page'>;

const NEWEST_FIRST = [{ createdAt: 'desc' }, { id: 'desc' }] as const;

/**
 * Read models behind the content-learning HTTP endpoints. Tenant reads check
 * that the caller's organization still has the learning account's credential
 * before returning a row; the admin inventory reads are platform-wide.
 */
@Traced()
@Injectable()
export class LearningReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: LearningAccountService,
  ) {}

  /** One page of checkpoints received for an account, newest first. */
  async evidence(
    organizationId: string,
    credentialId: string,
    { limit, page }: LearningPage,
  ) {
    await this.accounts.credential(organizationId, credentialId);
    return this.prisma.contentLearningCheckpoint.findMany({
      where: { organizationId, credentialId, isDeleted: false },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { receivedAt: 'desc' },
    });
  }

  async decision(organizationId: string, id: string) {
    const row = await this.prisma.contentLearningDecision.findFirst({
      where: { id, organizationId, isDeleted: false },
    });
    if (!row) throw new NotFoundException('Decision not found');
    await this.accounts.credential(organizationId, row.credentialId);
    return row;
  }

  /**
   * The learning decision that generated, or was bound to, a post. Exactly
   * one must match: none or an ambiguous pair is reported as not found.
   */
  async postDecision(organizationId: string, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, organizationId, isDeleted: false },
      select: {
        id: true,
        brandId: true,
        credentialId: true,
        learningDecisionId: true,
      },
    });
    if (!post?.credentialId) throw new NotFoundException('Decision not found');
    await this.accounts.credential(organizationId, post.credentialId);
    const rows = await this.prisma.contentLearningDecision.findMany({
      where: {
        organizationId,
        brandId: post.brandId,
        credentialId: post.credentialId,
        isDeleted: false,
        OR: [
          { generationId: post.id },
          ...(post.learningDecisionId ? [{ id: post.learningDecisionId }] : []),
        ],
      },
      take: 2,
    });
    if (rows.length !== 1) throw new NotFoundException('Decision not found');
    return rows[0];
  }

  async policy(organizationId: string, id: string) {
    const row = await this.prisma.contentLearningPolicyVersion.findFirst({
      where: { id, organizationId, isDeleted: false },
    });
    if (!row) throw new NotFoundException('Policy not found');
    await this.accounts.credential(organizationId, row.credentialId);
    return row;
  }

  /** Every live learning account on the platform, most recently edited first. */
  accountInventory(query: LearningPage) {
    return crossOrgUnsafe(() =>
      this.page(
        query,
        ({ skip, take }) =>
          // tenant-scope-ignore: superadmin inventory is platform-wide
          this.prisma.contentLearningAccount.findMany({
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            skip,
            take,
            where: { isDeleted: false },
          }),
        () =>
          // tenant-scope-ignore: superadmin inventory is platform-wide
          this.prisma.contentLearningAccount.count({
            where: { isDeleted: false },
          }),
      ),
    );
  }

  datasetInventory(query: LearningPage) {
    return this.page(
      query,
      ({ skip, take }) =>
        this.prisma.contentLearningDataset.findMany({
          orderBy: [...NEWEST_FIRST],
          skip,
          take,
          where: { isDeleted: false },
        }),
      () =>
        this.prisma.contentLearningDataset.count({
          where: { isDeleted: false },
        }),
    );
  }

  runInventory(query: LearningPage) {
    return this.page(
      query,
      ({ skip, take }) =>
        this.prisma.contentLearningRun.findMany({
          orderBy: [...NEWEST_FIRST],
          skip,
          take,
          where: { isDeleted: false },
        }),
      () =>
        this.prisma.contentLearningRun.count({ where: { isDeleted: false } }),
    );
  }

  releaseInventory(query: LearningPage) {
    return this.page(
      query,
      ({ skip, take }) =>
        this.prisma.contentLearningRelease.findMany({
          orderBy: [...NEWEST_FIRST],
          skip,
          take,
          where: { isDeleted: false },
        }),
      () =>
        this.prisma.contentLearningRelease.count({
          where: { isDeleted: false },
        }),
    );
  }

  /** The dataset and artifact of a completed training run, or null. */
  completedTraining(id: string) {
    return this.prisma.contentLearningRun.findFirst({
      where: {
        id,
        type: 'train',
        status: RunStatus.COMPLETED,
        isDeleted: false,
      },
      select: { datasetId: true, resultArtifactId: true },
    });
  }

  /** One database page plus the total, for the JSON:API `pagination` links. */
  private async page<T>(
    { limit, page }: LearningPage,
    load: (window: { skip: number; take: number }) => Promise<T[]>,
    count: () => Promise<number>,
  ): Promise<AggregatePaginateResult<T>> {
    const [docs, totalDocs] = await Promise.all([
      load({ skip: (page - 1) * limit, take: limit }),
      count(),
    ]);
    return buildPaginatedResult(docs, totalDocs, page, limit);
  }
}
