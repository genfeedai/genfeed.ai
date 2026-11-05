/**
 * Query catalog: the real queries, via the real code.
 *
 * Each entry calls into production code (services, controller query builders,
 * worker sweeps) instead of re-typing SQL, so a fix to that code is measured by
 * the very next run. Where a query is assembled inline in a controller handler
 * that cannot be called without HTTP, the entry rebuilds the `where` with the
 * same helper utilities and names the source in `source`.
 *
 * Every entry runs against the production Prisma client stack
 * (`@libs/prisma/prisma.service` with the CLOUD tenant guard), so tenant
 * scoping, soft-delete injection and the pg adapter behave as in production.
 */
import { createHash } from 'node:crypto';
import { ArticlesController } from '@api/collections/articles/controllers/articles.controller';
import { VideoGenerationLineageService } from '@api/collections/credits/services/video-generation-lineage.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { extensionPublicationAnalyticsDiscoveryFilter } from '@api/collections/posts/services/post-publication-capture.filters';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { StalePendingSystemExecutionFinderService } from '@api/collections/workflow-executions/services/stale-pending-system-execution-finder.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { LibraryShelfUtil } from '@api/helpers/utils/library-shelf/library-shelf.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { scopedWhere } from '@api/index';
import { NotificationInboxService } from '@api/services/notifications/inbox/notification-inbox.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { ScheduledPostDiscoveryService } from '@workers/services/scheduled-post-discovery.service';
import { FANOUT } from './scale';

export type TenantKind = 'typical' | 'whale';

export type Tenant = {
  brandId: string;
  index: number;
  kind: TenantKind;
  orgId: string;
  threadId: string;
  userId: string;
  /** Fan-out multiplier for this tenant (the scale for the whale, else 1). */
  weight: number;
};

export type QueryEnv = {
  logger: LoggerService;
  prisma: PrismaService;
  scale: number;
};

export type QuerySpec = {
  description: string;
  group: 'auth' | 'list' | 'detail' | 'analytics' | 'sweep';
  id: string;
  /** Where in production this query is issued from. */
  source: string;
  /** `tenant` runs once per tenant kind; `global` is a cross-tenant sweep. */
  scope: 'tenant' | 'global';
  /** Only meaningful for whales (deep pages, big aggregates). */
  whaleOnly?: boolean;
  prepare(env: QueryEnv): (tenant: Tenant) => Promise<unknown>;
};

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

export function tenantFor(index: number, scale: number): Tenant {
  const weight = index === 0 ? scale : 1;
  return {
    brandId: md5(`brand${index}_0`),
    index,
    kind: index === 0 ? 'whale' : 'typical',
    orgId: md5(`org${index}`),
    threadId: md5(`thread${index}_1`),
    userId: md5(`user${index}_0`),
    weight,
  };
}

type ControllerUser = Parameters<PostsController['buildFindAllQuery']>[0];

/** Collaborators that the measured query path never touches. */
const stub = <T>(): T => ({}) as T;

const user = (t: Tenant): ControllerUser =>
  ({
    brandId: t.brandId,
    id: t.userId,
    isSuperAdmin: false,
    organizationId: t.orgId,
    userId: t.userId,
  }) as unknown as ControllerUser;

const asService = <T>(value: unknown): T => value as T;

function genericList(
  model: string,
  prisma: PrismaService,
  logger: LoggerService,
) {
  class Svc extends BaseService<Record<string, unknown>> {
    constructor() {
      super(prisma, model, logger);
    }
  }
  return new Svc();
}

const PAGE = 20;
const options = (page: number) => ({
  customLabels,
  ...QueryDefaultsUtil.getPaginationDefaults({ limit: PAGE, page }),
});

/** Page that sits roughly in the middle of a whale's list. */
const deepPage = (rows: number, scale: number) =>
  Math.max(2, Math.floor((rows * scale) / PAGE / 2));

const tenantScoped =
  <T>(fn: (tenant: Tenant) => Promise<T>) =>
  (tenant: Tenant) =>
    runWithTenantContext({ organizationId: tenant.orgId }, () => fn(tenant));

export const CATALOG: QuerySpec[] = [
  // ───────────────────────── auth / request context ─────────────────────────
  {
    description: 'Per-request context: organization settings + subscription',
    group: 'auth',
    id: 'auth.request-context',
    prepare: ({ prisma, logger }) => {
      const settings = genericList('organizationSetting', prisma, logger);
      const subs = genericList('subscription', prisma, logger);
      return tenantScoped((t) =>
        Promise.all([
          settings.findOne({ organizationId: t.orgId }),
          subs.findOne({ organizationId: t.orgId }),
        ]),
      );
    },
    scope: 'tenant',
    source: 'common/middleware/request-context.middleware.ts hydrateContext',
  },
  {
    description: 'Access discovery: active memberships for a user',
    group: 'auth',
    id: 'auth.member-access',
    prepare: ({ prisma }) => {
      const members = asService<MembersService>(
        Object.create(MembersService.prototype),
      );
      (members as unknown as { prisma: unknown }).prisma = prisma;
      return (t) => members.findActiveForUserAccess(t.userId);
    },
    scope: 'tenant',
    source:
      'collections/members/services/members.service.ts findActiveForUserAccess',
  },
  // ─────────────────────────── notification inbox ───────────────────────────
  {
    description: 'Notification bell: unread count',
    group: 'list',
    id: 'inbox.count',
    prepare: ({ prisma }) => {
      const inbox = new NotificationInboxService(prisma);
      return tenantScoped((t) => inbox.count(t.orgId, t.userId));
    },
    scope: 'tenant',
    source: 'services/notifications/inbox/notification-inbox.service.ts count',
  },
  {
    description: 'Notification inbox: first page with activity + event',
    group: 'list',
    id: 'inbox.list',
    prepare: ({ prisma }) => {
      const inbox = new NotificationInboxService(prisma);
      return tenantScoped((t) => inbox.list(t.orgId, t.userId));
    },
    scope: 'tenant',
    source: 'services/notifications/inbox/notification-inbox.service.ts list',
  },
  // ─────────────────────────────── posts list ───────────────────────────────
  ...(['page1', 'calendar', 'scheduled', 'deep'] as const).map(
    (variant): QuerySpec => ({
      description: {
        calendar: 'Posts calendar: brand + 30-day scheduledDate window',
        deep: 'Posts list, mid-depth page (offset pagination + count)',
        page1: 'Posts list, first page, default sort',
        scheduled: 'Posts list filtered to executionState=scheduled',
      }[variant],
      group: 'list',
      id: `posts.list.${variant}`,
      prepare: ({ prisma, logger, scale }) => {
        const posts = new PostsService(prisma, logger, stub());
        const controller = Object.create(PostsController.prototype);
        return tenantScoped((t) => {
          const query = {
            ...(variant === 'calendar'
              ? {
                  brandId: t.brandId,
                  endDate: new Date(Date.now() + 15 * 864e5).toISOString(),
                  startDate: new Date(Date.now() - 15 * 864e5).toISOString(),
                }
              : {}),
            ...(variant === 'scheduled' ? { executionState: 'scheduled' } : {}),
            limit: PAGE,
            page: variant === 'deep' ? deepPage(FANOUT.posts * 0.7, scale) : 1,
          };
          return posts.findAll(
            controller.buildFindAllQuery(user(t), query),
            options(query.page),
          );
        });
      },
      scope: 'tenant',
      source: 'collections/posts/controllers/posts.controller.ts findAll',
      whaleOnly: variant === 'deep',
    }),
  ),
  // ─────────────────────────────── Library ──────────────────────────────────
  ...(['page1', 'deep', 'search'] as const).map(
    (variant): QuerySpec => ({
      description: {
        deep: 'Library list, mid-depth page',
        page1: 'Library list, first page, all categories',
        search: 'Library list with a text search (metadata.label ILIKE)',
      }[variant],
      group: 'list',
      id: `library.list.${variant}`,
      prepare: ({ prisma, logger, scale }) => {
        const ingredients = new IngredientsService(prisma, logger, stub());
        return tenantScoped((t) => {
          const page =
            variant === 'deep' ? deepPage(FANOUT.ingredients * 0.9, scale) : 1;
          const search =
            variant === 'search'
              ? CollectionFilterUtil.buildSearchFilter('launch', [
                  'metadata.label',
                  'metadata.description',
                  'prompt.prompt',
                ])
              : { where: {} };
          const aggregate = {
            include: IngredientFilterUtil.buildLibraryListInclude(),
            orderBy: Object.entries(handleQuerySort(undefined)).map(
              ([field, direction]) => ({ [field]: direction }),
            ),
            where: {
              AND: [
                { organizationId: t.orgId },
                { brandId: t.brandId },
                LibraryShelfUtil.buildStatusFilter(undefined, undefined, false),
                IngredientFilterUtil.buildStoryboardStillExclusion(),
                search.where,
              ],
              isDeleted: false,
            },
          };
          return ingredients.findAll(aggregate, options(page));
        });
      },
      scope: 'tenant',
      source:
        'collections/ingredients/controllers/ingredients.controller.ts findAll',
      whaleOnly: variant === 'deep',
    }),
  ),
  {
    description: 'Library sidebar counters (1 groupBy + 6 counts)',
    group: 'list',
    id: 'library.summary',
    prepare: ({ prisma, logger }) => {
      const ingredients = new IngredientsService(prisma, logger, stub());
      return tenantScoped((t) =>
        ingredients.getLibrarySummary(t.orgId, {
          brandId: t.brandId,
          AND: [IngredientFilterUtil.buildStoryboardStillExclusion()],
        }),
      );
    },
    scope: 'tenant',
    source:
      'collections/ingredients/services/ingredients.service.ts getLibrarySummary',
  },
  // ───────────────────────── other org-scoped lists ─────────────────────────
  {
    description: 'Articles list (userId OR scope=ORGANIZATION)',
    group: 'list',
    id: 'articles.list',
    prepare: ({ prisma, logger }) => {
      const articles = genericList('article', prisma, logger);
      const controller = Object.create(ArticlesController.prototype);
      return tenantScoped((t) =>
        articles.findAll(
          controller.buildFindAllQuery(user(t), { limit: PAGE, page: 1 }),
          options(1),
        ),
      );
    },
    scope: 'tenant',
    source:
      'collections/articles/controllers/articles.controller.ts buildFindAllQuery',
  },
  ...(
    [
      ['activities.list', 'activity', 'BaseCRUDController default list'],
      ['tasks.list', 'task', 'BaseCRUDController default list'],
      ['folders.list', 'folder', 'BaseCRUDController default list'],
      ['agent-threads.list', 'agentThread', 'BaseCRUDController default list'],
    ] as const
  ).map(
    ([id, model, source]): QuerySpec => ({
      description: `${model} list: { isDeleted:false, userId } + tenant scope, createdAt desc`,
      group: 'list',
      id,
      prepare: ({ prisma, logger }) => {
        const svc = genericList(model, prisma, logger);
        return tenantScoped((t) =>
          svc.findAll(
            {
              orderBy: handleQuerySort(undefined),
              where: { isDeleted: false, userId: t.userId },
            },
            options(1),
          ),
        );
      },
      scope: 'tenant',
      source: `shared/controllers/base-crud/base-crud.controller.ts (${source})`,
    }),
  ),
  {
    description: 'Credit transactions list: org ledger, newest first',
    group: 'list',
    id: 'credit-transactions.list',
    prepare: ({ prisma, logger }) => {
      const svc = genericList('creditTransaction', prisma, logger);
      return tenantScoped(() =>
        svc.findAll(
          { orderBy: handleQuerySort(undefined), where: { isDeleted: false } },
          options(1),
        ),
      );
    },
    scope: 'tenant',
    source:
      'shared/controllers/base-crud/base-crud.controller.ts (default list; creditTransaction has no userId)',
  },
  {
    description:
      'Credit ledger lookup by metadata.lineageId (JSON path, one org)',
    group: 'detail',
    id: 'credits.lineage',
    prepare: ({ prisma, logger }) => {
      const svc = new VideoGenerationLineageService(prisma, logger);
      return tenantScoped((t) =>
        svc.listByLineageId(t.orgId, 'lineage-does-not-exist'),
      );
    },
    scope: 'tenant',
    source:
      'collections/credits/services/video-generation-lineage.service.ts listByLineageId',
  },
  {
    description: 'Agent thread messages (one thread, chronological)',
    group: 'detail',
    id: 'agent-messages.thread',
    prepare: ({ prisma, logger }) => {
      const svc = genericList('agentMessage', prisma, logger);
      return tenantScoped((t) =>
        svc.findAll(
          { orderBy: { createdAt: 'asc' }, where: { threadId: t.threadId } },
          options(1),
        ),
      );
    },
    scope: 'tenant',
    source: 'collections/agent-messages/services/agent-messages.service.ts',
  },
  {
    description: 'Workflow executions list (+ workflow include)',
    group: 'list',
    id: 'workflow-executions.list',
    prepare: ({ prisma, logger }) => {
      const svc = new WorkflowExecutionsService(
        prisma,
        logger,
        stub(),
        stub(),
        stub(),
      );
      return tenantScoped(async (t) =>
        svc.findAll(
          {
            include: {
              workflow: {
                select: { description: true, id: true, label: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            where: await svc.buildCustomerListWhere(t.orgId, stub()),
          },
          options(1),
        ),
      );
    },
    scope: 'tenant',
    source:
      'collections/workflow-executions/controllers/workflow-executions.controller.ts findAll',
  },
  // ─────────────────────────────── analytics ────────────────────────────────
  ...(['overview', 'top-content'] as const).map(
    (variant): QuerySpec => ({
      description: {
        overview:
          'Analytics dashboard overview (period totals + platforms + counts)',
        'top-content': 'Top performing content (grouped by post)',
      }[variant],
      group: 'analytics',
      id: `analytics.${variant}`,
      prepare: ({ prisma, logger }) => {
        const posts = new PostsService(prisma, logger, stub());
        const analytics = new AnalyticsAggregationService(prisma, posts);
        const start = new Date(Date.now() - 30 * 864e5);
        const end = new Date();
        return tenantScoped((t) =>
          variant === 'overview'
            ? analytics.getOverviewMetrics(t.orgId, undefined, start, end)
            : analytics.getTopPerformingContent(
                t.orgId,
                undefined,
                10,
                undefined,
                start,
                end,
              ),
        );
      },
      scope: 'tenant',
      source: 'collections/posts/services/analytics-aggregation.service.ts',
    }),
  ),
  {
    description:
      'Analytics collection discovery: published posts due for a metrics pull (one org)',
    group: 'sweep',
    id: 'analytics.collection-due',
    prepare: ({ prisma, logger }) => {
      const posts = new PostsService(prisma, logger, stub());
      return tenantScoped((t) =>
        posts.findAll(
          {
            orderBy: [{ analyticsNextCollectAt: 'asc' }, { id: 'asc' }],
            where: scopedWhere(t.orgId, {
              AND: [extensionPublicationAnalyticsDiscoveryFilter()],
              analyticsNextCollectAt: { lte: new Date() },
              externalId: { not: null },
              isAnalyticsEnabled: { not: false },
              platform: { in: ['instagram', 'twitter', 'tiktok'] },
              ...postExecutionStateReadFilter('published'),
            }),
          },
          { customLabels, limit: 50, page: 1, pagination: true },
          false,
        ),
      );
    },
    scope: 'tenant',
    source:
      'collections/workflows/services/analytics-sync-workflow.service.ts discoverPosts',
  },
  {
    description: 'Analytics time series (daily totals for charts)',
    group: 'analytics',
    id: 'analytics.timeseries',
    prepare: ({ prisma, logger }) => {
      const posts = new PostsService(prisma, logger, stub());
      const analytics = new AnalyticsAggregationService(prisma, posts);
      const start = new Date(Date.now() - 30 * 864e5);
      const end = new Date();
      return tenantScoped((t) =>
        analytics.getTimeSeriesData(t.orgId, undefined, start, end),
      );
    },
    scope: 'tenant',
    source:
      'collections/posts/services/analytics-aggregation.service.ts getTimeSeriesData',
  },
  // ───────────────────────── cross-tenant worker sweeps ─────────────────────
  {
    description:
      'Reconcile sweep: stale PENDING system executions (JSON-path filter)',
    group: 'sweep',
    id: 'sweep.stale-pending-executions',
    prepare: ({ prisma }) => {
      const finder = new StalePendingSystemExecutionFinderService(prisma);
      return () =>
        finder.findMany(
          new Date(Date.now() - 15 * 60_000),
          new Date(Date.now() - 24 * 3_600_000),
          { limit: 200 },
        );
    },
    scope: 'global',
    source:
      'collections/workflow-executions/services/stale-pending-system-execution-finder.service.ts findMany',
  },
  {
    description:
      'Reconcile sweep: stalled interactive agent turns (2 JSON-path filters)',
    group: 'sweep',
    id: 'sweep.stalled-agent-turns',
    prepare: ({ prisma }) => {
      const finder = new StalePendingSystemExecutionFinderService(prisma);
      return () =>
        finder.findStalledInteractiveAgentTurns(
          new Date(Date.now() - 5 * 60_000),
          new Date(Date.now() - 2 * 3_600_000),
          50,
        );
    },
    scope: 'global',
    source:
      'collections/workflow-executions/services/stale-pending-system-execution-finder.service.ts findStalledInteractiveAgentTurns',
  },
  {
    description:
      'Worker sweep: posts due for publishing (every tenant, limit 50)',
    group: 'sweep',
    id: 'sweep.due-posts',
    prepare: ({ prisma, logger }) => {
      const posts = new PostsService(prisma, logger, stub());
      const discovery = new ScheduledPostDiscoveryService(posts);
      return () => discovery.findDuePosts({ limit: 50 });
    },
    scope: 'global',
    source:
      'apps/server/workers/src/services/scheduled-post-discovery.service.ts findDuePosts',
  },
];
