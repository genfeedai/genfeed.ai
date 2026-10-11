import {
  analyticsRootActor,
  analyticsRootActorKey,
  resolveAnalyticsCollectionAuthorization,
  resolveAnalyticsRootActor,
  resolveDailyPublishingAuthorization,
} from '@api/analytics/analytics-collection-actor';
import {
  admitAnalyticsCollection,
  isAnalyticsCollectionAuthorizationFailure,
} from '@api/analytics/analytics-collection-authorization';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  CHAIN_ACTOR,
  type ExecutionFixture,
  executionContext,
  executionLookup,
  hiddenExecutionRow,
  tenantExecutionRow,
} from '@api/authorization/brand-access/hidden-execution-chain.fixture';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ cloud: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => runtime.cloud,
}));

const ORG_REFRESH = 'analytics.organization-refresh';
const POST_REFRESH = 'analytics.post-refresh.twitter';
const TWITTER_CHILD = 'analytics.twitter.collect-item';

function root(
  canonicalId = ORG_REFRESH,
  overrides: Record<string, unknown> = {},
) {
  return hiddenExecutionRow({
    id: 'root',
    canonicalId,
    inputValues: { initiatingActor: CHAIN_ACTOR },
    metadata: {
      source:
        canonicalId === ORG_REFRESH
          ? 'analytics-api-refresh'
          : 'post-analytics-api-refresh',
    },
    ...overrides,
  });
}
function child(
  parentNodeId = 'collect-each-twitter',
  overrides: Record<string, unknown> = {},
) {
  return hiddenExecutionRow({
    id: 'child',
    canonicalId: TWITTER_CHILD,
    inputValues: {
      deferOutlierRefresh: true,
      item: { id: 'post-1', initiatingActor: CHAIN_ACTOR },
    },
    metadata: {
      parentExecutionId: 'root',
      parentNodeId,
      parentWorkflowId: 'workflow-root',
      workflowForEachIndex: 0,
      source: 'workflow.for-each:root:node',
    },
    ...overrides,
  });
}
function harness(rows: ExecutionFixture[]) {
  const findExecution = vi.fn(executionLookup(rows));
  const findMember = vi
    .fn()
    .mockResolvedValue({ role: { key: MemberRole.ADMIN }, brands: [] });
  const findKey = vi.fn().mockResolvedValue({ scopes: ['admin'] });
  const prisma = {
    apiKey: { findFirst: findKey },
    member: { findFirst: findMember },
    workflowExecution: { findFirst: findExecution },
    workflowExecutionNodeResult: { findFirst: vi.fn() },
  } as unknown as PrismaService;
  return {
    deps: { policy: new BrandAccessService(prisma), prisma },
    findExecution,
    findKey,
    findMember,
  };
}
const deniedMessage = 'analytics_collection_actor_denied';

describe('analytics collection actor from the pinned hidden chain', () => {
  beforeEach(() => {
    runtime.cloud = true;
  });

  describe('root persistence', () => {
    it('persists only authenticated fields and a scope-order-stable key', () => {
      const noisy = { ...CHAIN_ACTOR, role: 'OWNER', scopes: ['b', 'a', 'b'] };
      expect(analyticsRootActor(noisy, 'org')).toEqual({
        ...CHAIN_ACTOR,
        scopes: ['a', 'b'],
      });
      expect(
        analyticsRootActorKey({ ...CHAIN_ACTOR, scopes: ['b', 'a'] }),
      ).toBe(
        analyticsRootActorKey({ ...CHAIN_ACTOR, scopes: ['a', 'b', 'a'] }),
      );
    });

    it('refuses an actor of another organization or without a user', () => {
      expect(() =>
        analyticsRootActor(
          { ...CHAIN_ACTOR, organizationId: 'foreign' },
          'org',
        ),
      ).toThrow(deniedMessage);
      expect(() =>
        analyticsRootActor({ ...CHAIN_ACTOR, userId: '' }, 'org'),
      ).toThrow(deniedMessage);
    });
  });

  describe('discovery in a hidden refresh root', () => {
    it.each([ORG_REFRESH, POST_REFRESH])(
      'returns the validated persisted actor of %s',
      async (canonicalId) => {
        const row = root(canonicalId);
        const { deps } = harness([row]);
        await expect(
          resolveAnalyticsRootActor(deps, executionContext(row)),
        ).resolves.toEqual(CHAIN_ACTOR);
      },
    );

    it('keeps ordinary actor-less roots unchanged without any chain check', async () => {
      const sweep = root(ORG_REFRESH, { inputValues: {} });
      sweep.workflow.organizationId = 'org';
      const { deps, findMember } = harness([sweep]);
      await expect(
        resolveAnalyticsRootActor(deps, executionContext(sweep)),
      ).resolves.toBeUndefined();
      const missing = harness([]);
      await expect(
        resolveAnalyticsRootActor(missing.deps, executionContext(sweep)),
      ).resolves.toBeUndefined();
      expect(findMember).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a forged actor on a customer workflow',
        (row: ExecutionFixture) => {
          row.workflow.organizationId = 'org';
        },
      ],
      [
        'an unpinned execution',
        (row: ExecutionFixture) => {
          row.workflowVersion.workflowId = 'other';
        },
      ],
      [
        'a source the refresh does not queue from',
        (row: ExecutionFixture) => {
          row.result.metadata.source = 'workflow.for-each:x:y';
        },
      ],
      [
        'an actor of another organization',
        (row: ExecutionFixture) => {
          row.result.inputValues = {
            initiatingActor: { ...CHAIN_ACTOR, organizationId: 'foreign' },
          };
        },
      ],
      [
        'an actor that is not the execution user',
        (row: ExecutionFixture) => {
          row.userId = 'someone-else';
        },
      ],
    ])('denies %s', async (_name, tamper) => {
      const row = root();
      tamper(row);
      const { deps, findMember } = harness([row]);
      await expect(
        resolveAnalyticsRootActor(deps, executionContext(row)),
      ).rejects.toThrow(deniedMessage);
      expect(findMember).not.toHaveBeenCalled();
    });
  });

  describe('per-platform collection', () => {
    it('is actor-less, and reads nothing, when the item carries no actor', async () => {
      const { deps, findExecution } = harness([]);
      for (const item of [undefined, {}, { id: 'post-1' }])
        await expect(
          resolveAnalyticsCollectionAuthorization(
            deps,
            executionContext(child()),
            item,
          ),
        ).resolves.toBeUndefined();
      expect(findExecution).not.toHaveBeenCalled();
    });

    it.each([
      ['an organization refresh', ORG_REFRESH, 'collect-each-twitter'],
      ['a post refresh', POST_REFRESH, 'collect-post'],
    ])(
      'authorizes a child of %s from its validated chain',
      async (_n, canonicalId, nodeId) => {
        const parent = root(canonicalId);
        const row = child(nodeId);
        const { deps, findMember } = harness([parent, row]);
        const authorization = await resolveAnalyticsCollectionAuthorization(
          deps,
          executionContext(row),
          { initiatingActor: CHAIN_ACTOR },
        );
        expect(authorization?.initiatingActor).toEqual(CHAIN_ACTOR);
        expect(findMember).toHaveBeenCalledOnce();
        await expect(
          admitAnalyticsCollection(authorization, 'org'),
        ).resolves.toBeUndefined();
        expect(findMember).toHaveBeenCalledTimes(2);
      },
    );

    it('re-runs the live refresh on every admission', async () => {
      const row = child();
      const { deps, findMember } = harness([root(), row]);
      const authorization = await resolveAnalyticsCollectionAuthorization(
        deps,
        executionContext(row),
        { initiatingActor: CHAIN_ACTOR },
      );
      findMember.mockResolvedValue(null);
      const failure = await admitAnalyticsCollection(
        authorization,
        'org',
      ).catch((error: unknown) => error);
      expect(failure).toMatchObject({ message: 'Brand access denied' });
      expect(isAnalyticsCollectionAuthorizationFailure(failure)).toBe(true);
    });

    it('denies a revoked membership before any collection', async () => {
      const row = child();
      const { deps, findMember } = harness([root(), row]);
      findMember.mockResolvedValue(null);
      await expect(
        resolveAnalyticsCollectionAuthorization(deps, executionContext(row), {
          initiatingActor: CHAIN_ACTOR,
        }),
      ).rejects.toThrow('Brand access denied');
    });

    it('requires a live API key and shrinks its scopes', async () => {
      const keyed = {
        ...CHAIN_ACTOR,
        apiKeyId: 'key-1',
        isApiKey: true,
        scopes: ['admin', 'removed'],
      };
      const parent = root(ORG_REFRESH, {
        inputValues: { initiatingActor: keyed },
      });
      const row = child('collect-each-twitter', {
        inputValues: { item: { id: 'post-1', initiatingActor: keyed } },
      });
      const { deps, findKey } = harness([parent, row]);
      const authorization = await resolveAnalyticsCollectionAuthorization(
        deps,
        executionContext(row),
        { initiatingActor: keyed },
      );
      expect(authorization?.initiatingActor.scopes).toEqual(['admin']);
      findKey.mockResolvedValue(null);
      await expect(authorization?.admit()).rejects.toThrow(deniedMessage);
    });

    it.each([
      [
        'a forged item actor with none persisted',
        (_parent: ExecutionFixture, row: ExecutionFixture) => {
          row.result.inputValues = { item: { id: 'post-1' } };
        },
      ],
      [
        'a forged item actor that differs from the root actor',
        (_parent: ExecutionFixture, row: ExecutionFixture) => {
          row.result.inputValues = {
            item: {
              id: 'post-1',
              initiatingActor: { ...CHAIN_ACTOR, scopes: ['admin'] },
            },
          };
        },
      ],
      [
        'a root that persisted no actor',
        (parent: ExecutionFixture) => {
          parent.result.inputValues = {};
        },
      ],
      [
        'a parent that is a customer workflow',
        (parent: ExecutionFixture) => {
          parent.workflow.organizationId = 'org';
          parent.workflow.metadata = {};
        },
      ],
      [
        'an unpinned parent',
        (parent: ExecutionFixture) => {
          parent.workflowVersion.workflowId = 'other';
        },
      ],
      [
        'a parent run by another user',
        (parent: ExecutionFixture) => {
          parent.userId = 'other';
        },
      ],
      [
        'a parent of the wrong workflow',
        (_parent: ExecutionFixture, row: ExecutionFixture) => {
          row.result.metadata.parentWorkflowId = 'other';
        },
      ],
      [
        'a parent that is not a refresh workflow',
        (parent: ExecutionFixture) => {
          parent.workflow.metadata = hiddenExecutionRow({
            id: 'x',
            canonicalId: 'analytics-sync',
          }).workflow.metadata;
          parent.result.metadata.canonicalId = 'analytics-sync';
        },
      ],
      [
        'a child that is not a collection workflow',
        (_parent: ExecutionFixture, row: ExecutionFixture) => {
          row.workflow.metadata = hiddenExecutionRow({
            id: 'x',
            canonicalId: 'daily-publishing.account',
          }).workflow.metadata;
        },
      ],
      [
        'a child without a parent claim',
        (_parent: ExecutionFixture, row: ExecutionFixture) => {
          row.result.metadata = { canonicalId: TWITTER_CHILD };
        },
      ],
      [
        'a child unpinned to its version',
        (_parent: ExecutionFixture, row: ExecutionFixture) => {
          row.workflowVersion.workflowId = 'other';
        },
      ],
      [
        'a child of another organization actor',
        (_parent: ExecutionFixture, row: ExecutionFixture) => {
          row.result.inputValues = {
            item: {
              id: 'post-1',
              initiatingActor: { ...CHAIN_ACTOR, organizationId: 'foreign' },
            },
          };
        },
      ],
    ])('denies %s', async (_name, tamper) => {
      const parent = root();
      const row = child();
      tamper(parent, row);
      const { deps, findMember } = harness([parent, row]);
      await expect(
        resolveAnalyticsCollectionAuthorization(deps, executionContext(row), {
          initiatingActor: CHAIN_ACTOR,
        }),
      ).rejects.toThrow(deniedMessage);
      expect(findMember).not.toHaveBeenCalled();
    });

    it('does not let a post-refresh child claim an organization-refresh node', async () => {
      const parent = root(POST_REFRESH);
      const row = child('collect-each-twitter');
      const { deps } = harness([parent, row]);
      await expect(
        resolveAnalyticsCollectionAuthorization(deps, executionContext(row), {
          initiatingActor: CHAIN_ACTOR,
        }),
      ).rejects.toThrow(deniedMessage);
    });
  });

  describe('daily publishing account', () => {
    function scheduled(overrides: Record<string, unknown> = {}) {
      const parent = tenantExecutionRow({
        id: 'tenant',
        actor: CHAIN_ACTOR,
        ...overrides,
      });
      const row = hiddenExecutionRow({
        id: 'child',
        canonicalId: 'daily-publishing.account',
        inputValues: { item: { slotKey: 'slot' } },
        metadata: {
          parentExecutionId: 'tenant',
          parentNodeId: 'publish-each-account',
          parentWorkflowId: parent.workflowId,
          workflowForEachIndex: 0,
        },
      });
      return { parent, row };
    }
    const provenance = (row: ExecutionFixture) => ({
      executionId: row.id,
      workflowId: row.workflowId,
    });

    it('authorizes from the scheduled parent configuring principal', async () => {
      const { parent, row } = scheduled();
      const { deps, findMember } = harness([parent, row]);
      const authorization = await resolveDailyPublishingAuthorization(
        deps,
        executionContext(row),
        provenance(row),
      );
      expect(authorization?.initiatingActor).toEqual(CHAIN_ACTOR);
      expect(findMember).toHaveBeenCalledOnce();
    });

    it.each([
      ['a manual run', { trigger: 'manual' }],
      ['an unbound schedule', { actor: null }],
    ])('stays actor-less for %s', async (_name, overrides) => {
      const { parent, row } = scheduled(overrides);
      const { deps, findMember } = harness([parent, row]);
      await expect(
        resolveDailyPublishingAuthorization(
          deps,
          executionContext(row),
          provenance(row),
        ),
      ).resolves.toBeUndefined();
      expect(findMember).not.toHaveBeenCalled();
    });

    it('denies a revoked configuring principal', async () => {
      const { parent, row } = scheduled();
      const { deps, findMember } = harness([parent, row]);
      findMember.mockResolvedValue(null);
      await expect(
        resolveDailyPublishingAuthorization(
          deps,
          executionContext(row),
          provenance(row),
        ),
      ).rejects.toThrow('Brand access denied');
    });

    it.each([
      [
        'a schedule actor of another organization',
        { actor: { ...CHAIN_ACTOR, organizationId: 'foreign' } },
      ],
      ['a parent of another organization', { organizationId: 'foreign' }],
      ['a parent run by another user', { userId: 'other' }],
    ])('denies %s', async (_name, overrides) => {
      const { parent, row } = scheduled(overrides);
      const { deps } = harness([parent, row]);
      await expect(
        resolveDailyPublishingAuthorization(
          deps,
          executionContext(row),
          provenance(row),
        ),
      ).rejects.toThrow(deniedMessage);
    });

    it('denies provenance that is not the executing run', async () => {
      const { parent, row } = scheduled();
      const { deps } = harness([parent, row]);
      await expect(
        resolveDailyPublishingAuthorization(deps, executionContext(row), {
          executionId: 'other',
          workflowId: row.workflowId,
        }),
      ).rejects.toThrow(deniedMessage);
    });
  });
});
