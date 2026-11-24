import type {
  ReleaseGroupListQuery,
  ReleaseListPageRow,
} from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { buildReleaseListPageSql } from '@api/collections/post-groups/services/post-group-release-list.query';
import {
  NOT_LIVE_WHERE,
  NOT_TIKTOK_INBOX_DELIVERY_WHERE,
  PUBLISHED_AND_LIVE_WHERE,
  postRollupExecutionStateFilter,
  TIKTOK_INBOX_DELIVERY_WHERE,
} from '@api/collections/posts/services/post-inbox-delivery.filter';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  PostCategory,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  deriveReleaseStatusFromTargets,
  isTikTokInboxDelivered,
} from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Runs the release-list SQL against a real, migrated PostgreSQL. Point
 * POST_GROUP_RELEASE_LIST_TEST_DATABASE_URL at a disposable local database
 * whose name starts with `genfeed_release_list`; every test runs in a
 * transaction that is rolled back, with foreign keys relaxed for its rows
 * (`session_replication_role = replica`, which needs a superuser).
 */
vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

const connectionString = process.env.POST_GROUP_RELEASE_LIST_TEST_DATABASE_URL;
if (connectionString !== undefined) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('A disposable local release-list database is required.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/genfeed_release_list')
  ) {
    throw new Error('A disposable local release-list database is required.');
  }
}

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

class RollbackSignal extends Error {}

type GroupSeed = {
  baseContent?: string;
  brandId?: string | null;
  campaignId?: string | null;
  createdAt?: Date;
  id: string;
  isDeleted?: boolean;
  organizationId?: string;
  scheduledAt?: Date | null;
  title?: string;
  updatedAt?: Date;
};

type PostSeed = {
  agentThreadId?: string | null;
  brandId?: string;
  campaignId?: string | null;
  category?: PostCategory;
  createdAt?: Date;
  credentialId?: string | null;
  description?: string;
  externalId?: string | null;
  groupId?: string | null;
  id: string;
  isDeleted?: boolean;
  label?: string | null;
  organizationId?: string;
  parentId?: string | null;
  platform?: string | null;
  publicationDate?: Date | null;
  publishedAt?: Date | null;
  scheduledDate?: Date | null;
  state?: string;
  updatedAt?: Date;
  url?: string | null;
  workflowExecutionId?: string | null;
};

const EPOCH = new Date('2026-07-01T00:00:00.000Z');

async function insertGroup(
  tx: Prisma.TransactionClient,
  seed: GroupSeed,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "post_groups"
      ("id", "organizationId", "ownerId", "title", "baseContent", "brandId",
       "campaignId", "scheduledAt", "isDeleted", "createdAt", "updatedAt")
    VALUES (
      ${seed.id}, ${seed.organizationId ?? ORG}, 'user-1',
      ${seed.title ?? seed.id}, ${seed.baseContent ?? 'body'},
      ${seed.brandId ?? null}, ${seed.campaignId ?? null},
      ${seed.scheduledAt ?? null}, ${seed.isDeleted ?? false},
      ${seed.createdAt ?? EPOCH}, ${seed.updatedAt ?? EPOCH})`);
}

async function insertPost(
  tx: Prisma.TransactionClient,
  seed: PostSeed,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "posts"
      ("id", "organizationId", "brandId", "userId", "description", "label",
       "groupId", "parentId", "credentialId", "platform", "category",
       "scheduledDate", "targetExecutionState", "workflowExecutionId",
       "agentThreadId", "campaignId", "isDeleted", "createdAt", "updatedAt",
       "externalId", "publicationDate", "publishedAt", "url")
    VALUES (
      ${seed.id}, ${seed.organizationId ?? ORG}, ${seed.brandId ?? 'brand-1'},
      'user-1', ${seed.description ?? 'body'}, ${seed.label ?? null},
      ${seed.groupId ?? null}, ${seed.parentId ?? null},
      ${seed.credentialId === undefined ? 'credential-1' : seed.credentialId},
      ${seed.platform === undefined ? CredentialPlatform.INSTAGRAM : seed.platform},
      ${seed.category ?? PostCategory.POST}::"PostCategory",
      ${seed.scheduledDate ?? null},
      ${seed.state ?? TargetExecutionState.SCHEDULED},
      ${seed.workflowExecutionId ?? null}, ${seed.agentThreadId ?? null},
      ${seed.campaignId ?? null}, ${seed.isDeleted ?? false},
      ${seed.createdAt ?? EPOCH}, ${seed.updatedAt ?? EPOCH},
      ${seed.externalId ?? null}, ${seed.publicationDate ?? null},
      ${seed.publishedAt ?? null}, ${seed.url ?? null})`);
}

/** A group with one target per state. */
async function insertGroupWithTargets(
  tx: Prisma.TransactionClient,
  id: string,
  states: readonly string[],
  group: Omit<GroupSeed, 'id'> = {},
): Promise<void> {
  await insertGroup(tx, { id, ...group });
  for (const [index, state] of states.entries()) {
    await insertPost(tx, { groupId: id, id: `${id}-t${index}`, state });
  }
}

describe.skipIf(!connectionString)(
  'release list SQL on real PostgreSQL',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    async function inRolledBackTransaction(
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ): Promise<void> {
      if (!prisma) {
        throw new Error('Release list database is not configured.');
      }
      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
          await work(tx);
          throw new RollbackSignal();
        })
        .catch((error: unknown) => {
          if (!(error instanceof RollbackSignal)) {
            throw error;
          }
        });
    }

    async function listIds(
      tx: Prisma.TransactionClient,
      query: Partial<ReleaseGroupListQuery> = {},
      limit = 1000,
      offset = 0,
    ): Promise<ReleaseListPageRow[]> {
      return tx.$queryRaw<ReleaseListPageRow[]>(
        buildReleaseListPageSql(
          { organizationId: ORG, ...query },
          { limit, offset },
        ),
      );
    }

    async function listIdList(
      tx: Prisma.TransactionClient,
      query: Partial<ReleaseGroupListQuery> = {},
    ): Promise<string[]> {
      return (await listIds(tx, query)).map((row) => row.id);
    }

    it('derives the same release status as the canonical roll-up for every target-state combination', async () => {
      const states: string[] = [
        ...Object.values(TargetExecutionState),
        'bogus',
      ];
      const combinations: string[][] = [];
      for (const a of states) {
        combinations.push([a]);
        for (const b of states) {
          if (b >= a) {
            combinations.push([a, b]);
            for (const c of states) {
              if (c >= b) {
                combinations.push([a, b, c]);
              }
            }
          }
        }
      }

      await inRolledBackTransaction(async (tx) => {
        for (const [index, combination] of combinations.entries()) {
          await insertGroupWithTargets(tx, `g-${index}`, combination);
        }
        // A group-less post is a one-target release with the same roll-up.
        for (const [index, state] of states.entries()) {
          await insertPost(tx, { id: `solo-${index}`, state });
        }

        for (const status of Object.values(ReleaseStatus)) {
          const expectedGroups = combinations
            .map((combination, index) => ({ combination, index }))
            .filter(
              ({ combination }) =>
                deriveReleaseStatusFromTargets(
                  combination as TargetExecutionState[],
                ) === status,
            )
            .map(({ index }) => `g-${index}`);
          const expectedSolo = states
            .map((state, index) => ({ index, state }))
            .filter(
              ({ state }) =>
                deriveReleaseStatusFromTargets([
                  state as TargetExecutionState,
                ]) === status,
            )
            .map(({ index }) => `solo-${index}`);

          expect(
            (await listIdList(tx, { statuses: [status] })).sort(),
            status,
          ).toEqual([...expectedGroups, ...expectedSolo].sort());
        }
      });
    });

    it('isolates tenants, soft deletes, thread children, orphans and targets without a channel', async () => {
      await inRolledBackTransaction(async (tx) => {
        await insertGroupWithTargets(tx, 'visible', ['scheduled']);
        await insertGroupWithTargets(tx, 'other-org', ['scheduled'], {
          organizationId: OTHER_ORG,
        });
        await insertGroupWithTargets(tx, 'deleted', ['scheduled'], {
          isDeleted: true,
        });
        await insertGroup(tx, { id: 'no-targets' });
        await insertGroup(tx, { id: 'only-unlistable' });
        await insertPost(tx, {
          groupId: 'only-unlistable',
          id: 'blank-platform',
          platform: ' ',
        });
        await insertPost(tx, {
          credentialId: null,
          groupId: 'only-unlistable',
          id: 'no-credential',
        });
        await insertPost(tx, {
          groupId: 'only-unlistable',
          id: 'thread-child',
          parentId: 'visible-t0',
        });
        await insertPost(tx, {
          groupId: 'only-unlistable',
          id: 'deleted-target',
          isDeleted: true,
        });
        await insertPost(tx, { groupId: 'missing-group', id: 'orphan' });
        await insertPost(tx, { groupId: 'deleted', id: 'deleted-group-post' });
        await insertPost(tx, { id: 'legacy' });
        await insertPost(tx, {
          id: 'legacy-other-org',
          organizationId: OTHER_ORG,
        });
        await insertPost(tx, { id: 'legacy-deleted', isDeleted: true });

        expect((await listIdList(tx)).sort()).toEqual(['legacy', 'visible']);
        expect(await listIds(tx)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: 'legacy', isSynthetic: true }),
            expect.objectContaining({ id: 'visible', isSynthetic: false }),
          ]),
        );
      });
    });

    it('matches the schedule window on the release or any target, inclusive of both bounds', async () => {
      const startDate = new Date('2026-07-20T00:00:00.000Z');
      const endDate = new Date('2026-07-27T00:00:00.000Z');
      await inRolledBackTransaction(async (tx) => {
        await insertGroup(tx, { id: 'group-in', scheduledAt: startDate });
        await insertPost(tx, { groupId: 'group-in', id: 'p1' });
        await insertGroup(tx, { id: 'group-edge' });
        await insertPost(tx, {
          groupId: 'group-edge',
          id: 'p2',
          scheduledDate: endDate,
        });
        await insertGroup(tx, {
          id: 'group-out',
          scheduledAt: new Date('2026-07-27T00:00:01.000Z'),
        });
        await insertPost(tx, {
          groupId: 'group-out',
          id: 'p3',
          scheduledDate: new Date('2026-07-19T23:59:59.000Z'),
        });
        await insertPost(tx, {
          id: 'legacy-in',
          scheduledDate: new Date('2026-07-22T10:00:00.000Z'),
        });
        await insertPost(tx, { id: 'legacy-unscheduled' });

        expect((await listIdList(tx, { endDate, startDate })).sort()).toEqual([
          'group-edge',
          'group-in',
          'legacy-in',
        ]);
      });
    });

    it('orders by the earliest effective schedule with unscheduled last and the id as tie-breaker', async () => {
      const at = (hour: number) => new Date(Date.UTC(2026, 6, 20, hour));
      await inRolledBackTransaction(async (tx) => {
        await insertGroup(tx, { id: 'b', scheduledAt: at(10) });
        await insertPost(tx, { groupId: 'b', id: 'pb', scheduledDate: at(10) });
        await insertGroup(tx, { id: 'a', scheduledAt: at(10) });
        await insertPost(tx, { groupId: 'a', id: 'pa', scheduledDate: at(10) });
        await insertGroup(tx, { id: 'target-early', scheduledAt: at(12) });
        await insertPost(tx, {
          groupId: 'target-early',
          id: 'pe',
          scheduledDate: at(9),
        });
        await insertGroup(tx, { id: 'unscheduled' });
        await insertPost(tx, { groupId: 'unscheduled', id: 'pu' });

        expect(await listIdList(tx, { sort: 'scheduledDate: 1' })).toEqual([
          'target-early',
          'a',
          'b',
          'unscheduled',
        ]);
        // Descending flips the schedule, not the id tie-break.
        expect(await listIdList(tx, { sort: 'scheduledDate: -1' })).toEqual([
          'a',
          'b',
          'target-early',
          'unscheduled',
        ]);
      });
    });

    it('pages with a stable order and a total that ignores the page', async () => {
      await inRolledBackTransaction(async (tx) => {
        for (const id of ['a', 'b', 'c', 'd', 'e']) {
          await insertGroupWithTargets(tx, id, ['scheduled'], {
            createdAt: EPOCH,
          });
        }

        const first = await listIds(tx, {}, 2, 0);
        const second = await listIds(tx, {}, 2, 2);
        const beyond = await listIds(tx, {}, 2, 10);

        expect(first.map((row) => row.id)).toEqual(['a', 'b']);
        expect(second.map((row) => row.id)).toEqual(['c', 'd']);
        expect(first.every((row) => Number(row.totalDocs) === 5)).toBe(true);
        expect(beyond).toEqual([]);
      });
    });

    it('filters by campaign, brand, provenance, category, platform, credential and execution state', async () => {
      await inRolledBackTransaction(async (tx) => {
        await insertGroup(tx, { campaignId: 'cmp-1', id: 'campaign' });
        await insertPost(tx, {
          groupId: 'campaign',
          id: 'pc',
          campaignId: 'cmp-1',
        });
        await insertGroup(tx, { id: 'workflow' });
        await insertPost(tx, {
          groupId: 'workflow',
          id: 'pw',
          workflowExecutionId: 'execution-1',
        });
        await insertGroup(tx, { id: 'agent' });
        await insertPost(tx, {
          agentThreadId: 'thread-1',
          groupId: 'agent',
          id: 'pa',
        });
        await insertGroup(tx, { id: 'agent-and-workflow' });
        await insertPost(tx, {
          agentThreadId: 'thread-1',
          groupId: 'agent-and-workflow',
          id: 'paw',
          workflowExecutionId: 'execution-1',
        });
        await insertGroup(tx, { id: 'manual' });
        await insertPost(tx, {
          category: PostCategory.VIDEO,
          credentialId: 'credential-2',
          groupId: 'manual',
          id: 'pm',
          platform: CredentialPlatform.TIKTOK,
          state: TargetExecutionState.FAILED,
        });
        await insertGroup(tx, { brandId: 'brand-2', id: 'brand-two' });
        await insertPost(tx, {
          brandId: 'brand-2',
          groupId: 'brand-two',
          id: 'pb',
        });

        expect(await listIdList(tx, { campaignId: 'cmp-1' })).toEqual([
          'campaign',
        ]);
        expect(await listIdList(tx, { brandId: 'brand-2' })).toEqual([
          'brand-two',
        ]);
        expect(
          (
            await listIdList(tx, {
              sources: [
                ReleaseTargetSource.MANUAL,
                ReleaseTargetSource.WORKFLOW,
              ],
            })
          ).sort(),
        ).toEqual([
          'agent-and-workflow',
          'brand-two',
          'campaign',
          'manual',
          'workflow',
        ]);
        expect(
          await listIdList(tx, { sources: [ReleaseTargetSource.AGENT] }),
        ).toEqual(['agent']);
        expect(
          await listIdList(tx, {
            categories: [PostCategory.VIDEO],
            credentialIds: ['credential-2'],
            executionStates: [TargetExecutionState.FAILED],
            platforms: [CredentialPlatform.TIKTOK],
          }),
        ).toEqual(['manual']);
        // Facets must all hold on the same target.
        expect(
          await listIdList(tx, {
            categories: [PostCategory.VIDEO],
            platforms: [CredentialPlatform.INSTAGRAM],
          }),
        ).toEqual([]);
      });
    });

    it('treats a partially published release as posted, not as not-posted', async () => {
      await inRolledBackTransaction(async (tx) => {
        await insertGroupWithTargets(tx, 'partial', ['published', 'failed']);
        await insertGroupWithTargets(tx, 'unpublished', ['failed']);

        expect(await listIdList(tx, { publicationState: 'posted' })).toEqual([
          'partial',
        ]);
        expect(
          await listIdList(tx, { publicationState: 'not-posted' }),
        ).toEqual(['unpublished']);
      });
    });

    it('searches titles, content and target platform or category with literal wildcards', async () => {
      await inRolledBackTransaction(async (tx) => {
        await insertGroupWithTargets(tx, 'title', ['scheduled'], {
          title: 'Spring Launch',
        });
        await insertGroupWithTargets(tx, 'content', ['scheduled'], {
          baseContent: '<p>100% organic</p>',
        });
        await insertGroupWithTargets(tx, 'underscore', ['scheduled'], {
          title: 'a_b',
        });
        await insertGroupWithTargets(tx, 'other', ['scheduled'], {
          title: 'aXb',
        });
        await insertGroup(tx, { id: 'tiktok-video' });
        await insertPost(tx, {
          category: PostCategory.VIDEO,
          groupId: 'tiktok-video',
          id: 'ptv',
          platform: CredentialPlatform.TIKTOK,
        });
        await insertPost(tx, {
          description: 'plain legacy body',
          id: 'legacy-body',
          label: 'Legacy Label',
        });

        expect(await listIdList(tx, { search: 'SPRING' })).toEqual(['title']);
        expect(await listIdList(tx, { search: '100%' })).toEqual(['content']);
        expect(await listIdList(tx, { search: '%' })).toEqual(['content']);
        expect(await listIdList(tx, { search: 'a_b' })).toEqual(['underscore']);
        expect(await listIdList(tx, { search: 'tiktok' })).toEqual([
          'tiktok-video',
        ]);
        expect(await listIdList(tx, { search: 'video' })).toEqual([
          'tiktok-video',
        ]);
        expect(await listIdList(tx, { search: 'legacy label' })).toEqual([
          'legacy-body',
        ]);
      });
    });

    it('serves a full page through the service, hydrating releases in SQL order', async () => {
      await inRolledBackTransaction(async (tx) => {
        await insertGroupWithTargets(tx, 'older', ['scheduled'], {
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        });
        await insertGroupWithTargets(tx, 'newer', ['published'], {
          createdAt: new Date('2026-07-02T00:00:00.000Z'),
        });
        await insertPost(tx, { description: '<p>Legacy</p>', id: 'legacy' });

        const service = new PostGroupPersistenceService(
          tx as unknown as PrismaService,
          new PostGroupContractService(),
          {} as never,
        );
        const result = await service.listReleaseGroups({
          limit: 2,
          organizationId: ORG,
        });

        // 'legacy' and 'older' tie on createdAt; the id breaks it.
        expect(result.docs.map((release) => release.id)).toEqual([
          'newer',
          'legacy',
        ]);
        expect(result.docs[0]?.status).toBe(ReleaseStatus.PUBLISHED);
        expect(result).toMatchObject({ hasNextPage: true, totalDocs: 3 });
      });
    });

    describe('TikTok Inbox delivery', () => {
      const inboxReceipt = {
        externalId: 'v_inbox_url~receipt',
        platform: CredentialPlatform.TIKTOK,
        state: TargetExecutionState.PUBLISHED,
      };

      it('lists an Inbox receipt as a draft and never as posted', async () => {
        await inRolledBackTransaction(async (tx) => {
          await insertGroup(tx, { id: 'inbox-release' });
          await insertPost(tx, {
            ...inboxReceipt,
            groupId: 'inbox-release',
            id: 'inbox-target',
          });
          await insertPost(tx, { ...inboxReceipt, id: 'inbox-solo' });
          await insertGroup(tx, { id: 'live-release' });
          await insertPost(tx, {
            ...inboxReceipt,
            groupId: 'live-release',
            id: 'live-target',
            publicationDate: EPOCH,
            publishedAt: EPOCH,
            url: 'https://www.tiktok.com/@brand/video/1',
          });

          expect(
            (await listIdList(tx, { publicationState: 'posted' })).sort(),
          ).toEqual(['live-release']);
          expect(
            (await listIdList(tx, { publicationState: 'not-posted' })).sort(),
          ).toEqual(['inbox-release', 'inbox-solo']);
          expect(
            (
              await listIdList(tx, { statuses: [ReleaseStatus.PUBLISHED] })
            ).sort(),
          ).toEqual(['live-release']);
          expect(
            (await listIdList(tx, { statuses: [ReleaseStatus.DRAFT] })).sort(),
          ).toEqual(['inbox-release', 'inbox-solo']);
          expect(
            (
              await listIdList(tx, {
                executionStates: [TargetExecutionState.PUBLISHED],
              })
            ).sort(),
          ).toEqual(['live-release']);
          expect(
            (
              await listIdList(tx, {
                executionStates: [TargetExecutionState.DRAFT],
              })
            ).sort(),
          ).toEqual(['inbox-release', 'inbox-solo']);
        });
      });

      it('serves the Inbox flag on the release target and rolls the release up as a draft', async () => {
        await inRolledBackTransaction(async (tx) => {
          await insertGroup(tx, { id: 'inbox-release' });
          await insertPost(tx, {
            ...inboxReceipt,
            groupId: 'inbox-release',
            id: 'inbox-target',
          });
          await insertGroup(tx, { id: 'mixed-release' });
          await insertPost(tx, {
            ...inboxReceipt,
            groupId: 'mixed-release',
            id: 'mixed-inbox',
          });
          await insertPost(tx, {
            groupId: 'mixed-release',
            id: 'mixed-live',
            platform: CredentialPlatform.INSTAGRAM,
            publicationDate: EPOCH,
            publishedAt: EPOCH,
            state: TargetExecutionState.PUBLISHED,
            url: 'https://www.instagram.com/p/1',
          });

          const service = new PostGroupPersistenceService(
            tx as unknown as PrismaService,
            new PostGroupContractService(),
            {} as never,
          );
          const { docs } = await service.listReleaseGroups({
            limit: 10,
            organizationId: ORG,
          });
          const byId = new Map(docs.map((release) => [release.id, release]));

          expect(byId.get('inbox-release')?.status).toBe(ReleaseStatus.DRAFT);
          expect(
            byId.get('inbox-release')?.targets.map((t) => t.isInboxDelivery),
          ).toEqual([true]);
          expect(byId.get('mixed-release')?.status).toBe(
            ReleaseStatus.PARTIALLY_PUBLISHED,
          );
          expect(
            byId
              .get('mixed-release')
              ?.targets.map((t) => [t.id, t.isInboxDelivery]),
          ).toEqual(
            expect.arrayContaining([
              ['mixed-inbox', true],
              ['mixed-live', false],
            ]),
          );
        });
      });

      it('keeps a post with no platform out of the Inbox filter and inside the live one', async () => {
        await inRolledBackTransaction(async (tx) => {
          await insertPost(tx, {
            externalId: 'ext',
            id: 'no-platform',
            platform: null,
            state: TargetExecutionState.PUBLISHED,
          });
          const idsWhere = async (where: Prisma.PostWhereInput) =>
            (await tx.post.findMany({ select: { id: true }, where })).map(
              (post) => post.id,
            );

          expect(await idsWhere(TIKTOK_INBOX_DELIVERY_WHERE)).toEqual([]);
          expect(await idsWhere(NOT_TIKTOK_INBOX_DELIVERY_WHERE)).toEqual([
            'no-platform',
          ]);
          expect(await idsWhere(PUBLISHED_AND_LIVE_WHERE)).toEqual([
            'no-platform',
          ]);
        });
      });

      it('restates isTikTokInboxDelivered for every combination of the columns it reads', async () => {
        const platforms = [
          CredentialPlatform.TIKTOK,
          CredentialPlatform.INSTAGRAM,
        ];
        const states = [
          TargetExecutionState.PUBLISHED,
          TargetExecutionState.DRAFT,
        ];
        const externalIds = [null, '', 'ext'];
        const dates = [null, EPOCH];
        const urls = [null, '', 'https://www.tiktok.com/@brand/video/1'];
        const rows: PostSeed[] = [];
        for (const platform of platforms) {
          for (const state of states) {
            for (const externalId of externalIds) {
              for (const publicationDate of dates) {
                for (const publishedAt of dates) {
                  for (const url of urls) {
                    rows.push({
                      externalId,
                      id: `row-${rows.length}`,
                      platform,
                      publicationDate,
                      publishedAt,
                      state,
                      url,
                    });
                  }
                }
              }
            }
          }
        }

        await inRolledBackTransaction(async (tx) => {
          for (const row of rows) {
            await insertPost(tx, row);
          }
          const posted = new Set(
            await listIdList(tx, { publicationState: 'posted' }),
          );
          const inbox = new Set(
            (
              await listIdList(tx, {
                executionStates: [TargetExecutionState.DRAFT],
              })
            ).filter((id) =>
              rows.some(
                (row) =>
                  row.id === id && row.state === TargetExecutionState.PUBLISHED,
              ),
            ),
          );

          // The Prisma filters the posts list, the public profile and the
          // counts use read the same rows the SQL above does.
          const idsWhere = async (where: Prisma.PostWhereInput) =>
            new Set(
              (await tx.post.findMany({ select: { id: true }, where })).map(
                (post) => post.id,
              ),
            );
          const inboxRows = await idsWhere(TIKTOK_INBOX_DELIVERY_WHERE);
          const notInboxRows = await idsWhere(NOT_TIKTOK_INBOX_DELIVERY_WHERE);
          const liveRows = await idsWhere(PUBLISHED_AND_LIVE_WHERE);
          const notLiveRows = await idsWhere(NOT_LIVE_WHERE);
          const rollupDraftRows = await idsWhere(
            postRollupExecutionStateFilter(TargetExecutionState.DRAFT),
          );

          for (const row of rows) {
            const isInbox = isTikTokInboxDelivered({
              externalId: row.externalId,
              platform: row.platform,
              publicationDate: row.publicationDate,
              publishedAt: row.publishedAt,
              targetExecutionState: row.state,
              url: row.url,
            });
            expect(inbox.has(row.id), JSON.stringify(row)).toBe(isInbox);
            expect(posted.has(row.id), JSON.stringify(row)).toBe(
              row.state === TargetExecutionState.PUBLISHED && !isInbox,
            );
            const isLive =
              row.state === TargetExecutionState.PUBLISHED && !isInbox;
            expect(inboxRows.has(row.id), JSON.stringify(row)).toBe(isInbox);
            expect(notInboxRows.has(row.id), JSON.stringify(row)).toBe(
              !isInbox,
            );
            expect(liveRows.has(row.id), JSON.stringify(row)).toBe(isLive);
            expect(notLiveRows.has(row.id), JSON.stringify(row)).toBe(!isLive);
            expect(rollupDraftRows.has(row.id), JSON.stringify(row)).toBe(
              row.state === TargetExecutionState.DRAFT || isInbox,
            );
          }
        });
      });
    });
  },
);
