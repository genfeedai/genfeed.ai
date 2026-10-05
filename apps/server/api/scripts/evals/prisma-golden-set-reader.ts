import { isRecord } from '@genfeedai/utils/data/extract.util';
import {
  HARNESS_PROFILE_TYPE,
  READER_PAGE_SIZE,
  WINNERS_CONTEXT_PURPOSE,
} from './golden-set.constants';
import type {
  GoldenFindManyDelegate,
  GoldenRecordOrder,
  GoldenScopedRecord,
  GoldenSetPrismaClient,
  GoldenSetReader,
  GoldenSetRecordWhere,
  GoldenSetScope,
  GoldenSetScopeSnapshot,
  GoldenSetWindow,
} from './golden-set.types';

function orderBy(): GoldenRecordOrder[] {
  return [{ createdAt: 'asc' }, { id: 'asc' }];
}
function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
async function pages<TRow extends GoldenScopedRecord>(
  delegate: GoldenFindManyDelegate<TRow>,
  where: GoldenSetRecordWhere,
): Promise<TRow[]> {
  const rows: TRow[] = [];
  let last: TRow | undefined;
  for (;;) {
    const page = await delegate.findMany({
      where: {
        ...where,
        ...(last
          ? {
              OR: [
                { createdAt: { gt: last.createdAt } },
                { createdAt: last.createdAt, id: { gt: last.id } },
              ],
            }
          : {}),
      },
      orderBy: orderBy(),
      take: READER_PAGE_SIZE,
    });
    rows.push(...page);
    if (page.length < READER_PAGE_SIZE) return rows;
    last = page.at(-1);
  }
}
export class PrismaGoldenSetReader implements GoldenSetReader {
  constructor(private readonly client: GoldenSetPrismaClient) {}
  async readScope(
    scope: GoldenSetScope,
    window: GoldenSetWindow,
  ): Promise<GoldenSetScopeSnapshot> {
    const tenant: GoldenSetRecordWhere = {
      organizationId: scope.organizationId,
      isDeleted: false,
    };
    const primary: GoldenSetRecordWhere = {
      ...tenant,
      createdAt: { gte: window.from, lt: window.to },
    };
    const branded: GoldenSetRecordWhere = {
      ...primary,
      ...(scope.brandIds.length > 0
        ? { brandId: { in: unique(scope.brandIds) } }
        : {}),
    };
    const organization = await this.client.organization.findFirst({
      where: { id: scope.organizationId, isDeleted: false },
      orderBy: orderBy(),
    });
    if (!organization) throw new Error('Scope organization was not found');
    const brands = [
      ...(await this.client.brand.findMany({
        where: tenant,
        orderBy: orderBy(),
        select: { id: true, label: true, slug: true },
      })),
    ];
    const credentials = [
      ...(await this.client.credential.findMany({
        where: { ...tenant, brandId: { in: brands.map((brand) => brand.id) } },
        orderBy: orderBy(),
        select: {
          brandId: true,
          externalHandle: true,
          externalName: true,
          username: true,
        },
      })),
    ];
    const members = [
      ...(await this.client.member.findMany({
        where: tenant,
        orderBy: orderBy(),
        select: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              name: true,
              handle: true,
            },
          },
        },
      })),
    ];
    const posts = await pages(this.client.post, {
      ...branded,
      parentId: null,
      reviewDecision: { not: null },
    });
    const batchItems = await pages(this.client.batchItem, {
      ...branded,
      reviewDecision: { not: null },
    });
    const evaluations = await pages(this.client.evaluation, {
      ...primary,
      contentType: { in: ['post', 'article'] },
    });
    const newsletters = await pages(this.client.newsletter, {
      ...branded,
      approvedAt: { not: null },
      approvedByUserId: { not: null },
    });
    const profiles = (
      await pages(this.client.profile, {
        ...primary,
        data: { path: ['profileType'], equals: HARNESS_PROFILE_TYPE },
      })
    ).map((profile) => {
      const data = record(profile.data);
      const entries = Array.isArray(data.avoidFeedback)
        ? data.avoidFeedback.filter(isRecord)
        : [];
      const isInWindow = (entry: Record<string, unknown>): boolean => {
        const addedAt = Date.parse(string(entry.addedAt) ?? '');
        return (
          addedAt >= window.from.getTime() && addedAt < window.to.getTime()
        );
      };
      const excludedContent = new Set(
        entries
          .filter((entry) => !isInWindow(entry))
          .map((entry) => entry.content),
      );
      const examples = record(data.examples);
      const avoid = examples.avoid;
      return {
        ...profile,
        data: {
          ...data,
          avoidFeedback: entries.filter(isInWindow),
          ...(Array.isArray(avoid)
            ? {
                examples: {
                  ...examples,
                  avoid: avoid.filter((value) => !excludedContent.has(value)),
                },
              }
            : {}),
        },
      };
    });
    const contextBases = await pages(this.client.contextBase, {
      ...tenant,
      data: { path: ['purpose'], equals: WINNERS_CONTEXT_PURPOSE },
    });
    const contextEntries = await pages(this.client.contextEntry, {
      ...primary,
      contextBaseId: { in: contextBases.map((base) => base.id) },
    });
    const references = profiles.flatMap((profile) => {
      const feedback = record(profile.data).avoidFeedback;
      return Array.isArray(feedback)
        ? feedback
            .filter(isRecord)
            .flatMap((entry) =>
              typeof entry.source === 'string' ? [entry.source] : [],
            )
        : [];
    });
    const postIds = unique([
      ...evaluations.flatMap((evaluation) =>
        evaluation.contentType === 'post' && evaluation.contentId !== null
          ? [evaluation.contentId]
          : [],
      ),
      ...contextEntries.flatMap((entry) => {
        const id = string(record(record(entry.data).metadata).postId);
        return id === null ? [] : [id];
      }),
      ...batchItems.flatMap((item) => {
        const id = string(record(item.data).postId);
        return id === null ? [] : [id];
      }),
      ...references
        .filter((source) => source.startsWith('post:'))
        .map((source) => source.slice(5)),
    ]);
    const linkedBatchItems = await pages(this.client.batchItem, {
      ...tenant,
      id: {
        in: unique(
          references
            .filter((source) => source.startsWith('batch_item:'))
            .map((source) => source.slice(11)),
        ),
      },
    });
    const linkedPosts = await pages(this.client.post, {
      ...tenant,
      id: {
        in: unique([
          ...postIds,
          ...linkedBatchItems.flatMap((item) => {
            const id = string(record(item.data).postId);
            return id === null ? [] : [id];
          }),
        ]),
      },
    });
    const linkedArticles = await pages(this.client.article, {
      ...tenant,
      id: {
        in: unique(
          evaluations.flatMap((evaluation) =>
            evaluation.contentType === 'article' &&
            evaluation.contentId !== null
              ? [evaluation.contentId]
              : [],
          ),
        ),
      },
    });
    const linkedNewsletters = await pages(this.client.newsletter, {
      ...tenant,
      id: {
        in: unique(
          references
            .filter((source) => source.startsWith('newsletter:'))
            .map((source) => source.slice(11)),
        ),
      },
    });
    const threadChildren = await pages(this.client.post, {
      ...tenant,
      parentId: {
        in: unique(
          [...posts, ...linkedPosts]
            .filter((post) => post.parentId === null)
            .map((post) => post.id),
        ),
      },
    });
    return {
      scope,
      organization,
      brands,
      credentials,
      members,
      posts,
      batchItems,
      evaluations,
      newsletters,
      profiles,
      contextBases,
      contextEntries,
      linkedPosts,
      linkedArticles,
      linkedNewsletters,
      linkedBatchItems,
      threadChildren,
    };
  }
}
