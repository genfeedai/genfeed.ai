import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  assertLearningRuntimeApplicationNames,
  assertLearningRuntimeFence,
  captureLearningRuntimePublication,
  disposeLearningRuntimeScenario,
  installLearningRuntimeBarrier,
  installLearningRuntimeFailure,
  type LearningRuntimeFixture,
  learningRuntimeScope,
  openLearningRuntimeFixture,
  publishLearningRuntimePost,
  type RuntimePublication,
  type RuntimeTarget,
  seedLearningRuntimeScenario,
  snapshotLearningRuntimeTarget,
  waitLearningRuntimeContender,
} from './content-learning-runtime.fixture';

type Actor =
  | 'scheduler-withdrawal'
  | 'post-patch'
  | 'post-remove'
  | 'credential-disconnect'
  | 'credential-bulk'
  | 'credential-oauth'
  | 'brand-deactivate'
  | 'brand-remove'
  | 'organization-remove'
  | 'child-create';
type Projection = 'capture' | 'materializer';
type Ordering = 'projection-first' | 'source-first';
const actors: Actor[] = [
  'scheduler-withdrawal',
  'post-patch',
  'post-remove',
  'credential-disconnect',
  'credential-bulk',
  'credential-oauth',
  'brand-deactivate',
  'brand-remove',
  'organization-remove',
  'child-create',
];
const contentionCases = actors.flatMap((actor) =>
  (['capture', 'materializer'] as Projection[]).flatMap((projection) =>
    (['projection-first', 'source-first'] as Ordering[]).map((ordering) => ({
      actor,
      projection,
      ordering,
    })),
  ),
);
function ensure(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}

async function mutate(
  fixture: LearningRuntimeFixture,
  actor: Actor,
  publication: RuntimePublication,
) {
  const target = publication.target,
    services = fixture.secondServices;
  const {
    PostVisibility,
    TargetExecutionState,
    CredentialPlatform,
    PostCategory,
    PostFormat,
  } = await import('@genfeedai/contracts');
  const { runWithTenantContext } = await import('@libs/prisma/tenant-context');
  return runWithTenantContext(
    { organizationId: target.organizationId },
    async () => {
      switch (actor) {
        case 'scheduler-withdrawal':
          return fixture.second.scheduler.transitionPost(
            { id: publication.id, organizationId: target.organizationId },
            {
              executionState: TargetExecutionState.PUBLISHED,
              visibility: PostVisibility.PRIVATE,
            },
            'Owned publication withdrawal',
          );
        case 'post-patch':
          return services.posts.patch(publication.id, {
            description: 'Owned factual caption edit',
          });
        case 'post-remove':
          return services.posts.remove(publication.id);
        case 'credential-disconnect':
          return services.credentials.patch(target.credentialId, {
            isConnected: false,
          });
        case 'credential-bulk':
          return services.credentials.patchAll(
            {
              id: target.credentialId,
              organizationId: target.organizationId,
              isDeleted: false,
            },
            { isConnected: false },
          );
        case 'credential-oauth':
          return services.credentials.connectAccount(
            target.credentialId,
            target.organizationId,
            {
              id: `owned-account-${target.credentialId}`,
              handle: 'owned-reconnected',
            },
            {
              accessToken: 'owned-reconnected-token',
              accessTokenSecret: 'owned-reconnected-secret',
              isConnected: true,
            },
          );
        case 'brand-deactivate':
          return services.brands.patch(target.brandId, { isActive: false });
        case 'brand-remove':
          return services.brandLifecycle.remove(
            target.organizationId,
            target.brandId,
          );
        case 'organization-remove':
          return services.organizations.patch(target.organizationId, {
            isDeleted: true,
          });
        case 'child-create':
          return services.posts.create({
            label: 'Owned child',
            description: 'Owned child text',
            ingredients: [],
            userId: target.actorId,
            organizationId: target.organizationId,
            brandId: target.brandId,
            credentialId: target.credentialId,
            parentId: publication.id,
            platform: CredentialPlatform.TWITTER,
            category: PostCategory.TEXT,
            format: PostFormat.STANDARD,
          });
      }
    },
  );
}
function mutationTable(
  actor: Actor,
): 'posts' | 'credentials' | 'brands' | 'organizations' {
  if (actor.startsWith('credential-')) return 'credentials';
  if (actor.startsWith('brand-')) return 'brands';
  return actor === 'organization-remove' ? 'organizations' : 'posts';
}
async function seedProjection(
  fixture: LearningRuntimeFixture,
  projection: Projection,
  target: RuntimeTarget,
) {
  const publications: RuntimePublication[] = [];
  const count = projection === 'capture' ? 1 : 20;
  for (let index = 0; index < count; index++)
    publications.push(
      await publishLearningRuntimePost(fixture.first, fixture.services, target),
    );
  const scope = await learningRuntimeScope(
    fixture.first,
    fixture.services,
    target,
  );
  if (projection === 'materializer')
    for (const publication of publications)
      expect(
        (await captureLearningRuntimePublication(fixture.services, publication))
          ?.validity,
      ).toBe('valid');
  return { publications, scope };
}
async function runProjection(
  fixture: LearningRuntimeFixture,
  projection: Projection,
  publication: RuntimePublication,
  scope: Awaited<ReturnType<typeof learningRuntimeScope>>,
) {
  return projection === 'capture'
    ? captureLearningRuntimePublication(fixture.services, publication)
    : fixture.services.materializer.materialize(
        scope.scope,
        scope.descriptor,
        new Date(),
      );
}

// Every barrier is an actual owned-schema PostgreSQL row/advisory lock.
// Both contenders invoke the original production actor/projection services.
describe('hosted actual learning publication contention and atomicity', () => {
  let fixture: LearningRuntimeFixture;
  let scenario: RuntimeTarget[] = [];
  beforeAll(async () => {
    fixture = await openLearningRuntimeFixture('learning-races');
    await assertLearningRuntimeApplicationNames(fixture);
    const { SERVER_TOKENS } = await import('@api/server.dependencies');
    const { PostLifecycleModule } = await import(
      '@api/collections/posts/post-lifecycle.module'
    );
    const { PostLifecycleService } = await import(
      '@api/post-lifecycle/post-lifecycle.service'
    );
    const { LoggerService } = await import('@libs/logger/logger.service');
    for (const application of [fixture.first, fixture.second]) {
      const lifecycleModule = application.module.select(PostLifecycleModule);
      const lifecycle = lifecycleModule.get(PostLifecycleService, {
        strict: true,
      });
      const logger = application.module.get(LoggerService);
      expect(lifecycle).toBeInstanceOf(PostLifecycleService);
      expect(lifecycle.constructor).toBe(PostLifecycleService);
      expect(application.module.get(PostLifecycleService)).toBe(lifecycle);
      expect(logger).toBeInstanceOf(LoggerService);
      expect(logger.constructor).toBe(LoggerService);
      expect(lifecycleModule.get(SERVER_TOKENS.prisma, { strict: true })).toBe(
        application.prisma,
      );
      expect(lifecycleModule.get(SERVER_TOKENS.logger, { strict: true })).toBe(
        logger,
      );
    }
  }, 180000);
  beforeEach(async () => {
    await fixture.resources.check();
    scenario = await seedLearningRuntimeScenario(
      fixture.first,
      fixture.services,
    );
  });
  afterEach(async () => {
    await disposeLearningRuntimeScenario(fixture, scenario);
    fixture.transports.assertNoViolations();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  }, 60000);

  it.each(contentionCases)(
    '$actor serializes $projection in $ordering with actual fence/account locks and retained invalidation',
    async ({ actor, projection, ordering }) => {
      const target = scenario[0],
        victim = scenario[1];
      const setup = await seedProjection(fixture, projection, target),
        publication = setup.publications[0];
      // OAuth refresh retains source validity; withdrawal actors invalidate it.
      const sourcePreserving = actor === 'credential-oauth';
      const credentialWhere = {
        id: target.credentialId,
        organizationId: target.organizationId,
        isDeleted: false,
      };
      const originalCredential =
        await fixture.first.prisma.credential.findFirstOrThrow({
          where: credentialWhere,
        });
      const retainedDependencies = sourcePreserving
        ? await fixture.first.prisma.contentLearningDependency.findMany({
            where: {
              sourceKind: 'credential',
              sourceId: target.credentialId,
              sourceOrganizationId: target.organizationId,
              isDeleted: false,
            },
            select: { id: true, valid: true },
          })
        : [];
      if (sourcePreserving) {
        const previous = await snapshotLearningRuntimeTarget(fixture, target);
        const { runWithTenantContext } = await import(
          '@libs/prisma/tenant-context'
        );
        await expect(
          runWithTenantContext(
            { organizationId: target.organizationId },
            async () =>
              fixture.secondServices.credentials.connectAccount(
                target.credentialId,
                target.organizationId,
                {
                  id: `owned-different-${randomUUID()}`,
                  handle: 'refused-account',
                },
                { accessToken: 'refused-token', isConnected: true },
              ),
          ),
        ).rejects.toMatchObject({ response: { title: 'Already Connected' } });
        expect(await snapshotLearningRuntimeTarget(fixture, target)).toEqual(
          previous,
        );
        expect(
          await fixture.first.prisma.credential.findFirstOrThrow({
            where: credentialWhere,
          }),
        ).toEqual(originalCredential);
      }
      const before =
        await fixture.first.prisma.contentLearningAccount.findFirstOrThrow({
          where: {
            id: target.accountId,
            organizationId: target.organizationId,
            isDeleted: false,
          },
        });
      const victimBefore = await snapshotLearningRuntimeTarget(fixture, victim);
      const { CacheService } = await import(
        '@api/services/cache/cache.service'
      );
      const cache = fixture.second.module.get(CacheService);
      const cacheKey = `${fixture.resources.prefix}:post-commit:${randomUUID()}`;
      const controlKey = `${cacheKey}:control`;
      if (actor === 'post-patch') {
        expect(await cache.set(controlKey, publication.id, { ttl: 300 })).toBe(
          true,
        );
        expect(
          await cache.set(cacheKey, publication.id, {
            tags: ['post'],
            ttl: 300,
          }),
        ).toBe(true);
        expect(await cache.get(cacheKey)).toBe(publication.id);
      }
      let result: Awaited<ReturnType<typeof runProjection>> | undefined;
      if (ordering === 'projection-first') {
        if (projection === 'capture') {
          const barrier = await installLearningRuntimeBarrier(
            fixture,
            'content_learning_checkpoints',
            target.organizationId,
            'INSERT',
          );
          const reader = runProjection(
            fixture,
            projection,
            publication,
            setup.scope,
          );
          reader.catch(() => undefined);
          let writer: ReturnType<typeof mutate> | undefined;
          try {
            const held = await barrier.wait(0);
            await assertLearningRuntimeFence(fixture, held.pid, 'ShareLock');
            writer = mutate(fixture, actor, publication);
            writer.catch(() => undefined);
            const blocked = await waitLearningRuntimeContender(
              fixture,
              1,
              held.pid,
            );
            expect(blocked.query).toContain('pg_advisory_xact_lock');
            if (actor === 'post-patch')
              expect(await cache.get(cacheKey)).toBe(publication.id);
            await barrier.release();
            const completed = await Promise.all([reader, writer]);
            result = completed[0];
          } finally {
            await barrier.release();
            await Promise.allSettled([reader, ...(writer ? [writer] : [])]);
            await barrier.close();
          }
          expect(result && 'validity' in result ? result.validity : null).toBe(
            'valid',
          );
        } else {
          await fixture.database.control.query('BEGIN');
          await fixture.database.control.query(
            'SELECT id FROM content_learning_accounts WHERE id=$1 AND "organizationId"=$2 FOR UPDATE',
            [target.accountId, target.organizationId],
          );
          const controlPid = Number(
            (
              await fixture.database.control.query(
                'SELECT pg_backend_pid() AS pid',
              )
            ).rows[0].pid,
          );
          const reader = runProjection(
            fixture,
            projection,
            publication,
            setup.scope,
          );
          reader.catch(() => undefined);
          let writer: ReturnType<typeof mutate> | undefined;
          try {
            const held = await waitLearningRuntimeContender(
              fixture,
              0,
              controlPid,
            );
            expect(held.query).toContain('content_learning_accounts');
            expect(held.query).toContain('FOR UPDATE');
            await assertLearningRuntimeFence(fixture, held.pid, 'ShareLock');
            writer = mutate(fixture, actor, publication);
            writer.catch(() => undefined);
            const blocked = await waitLearningRuntimeContender(
              fixture,
              1,
              held.pid,
            );
            expect(blocked.query).toContain('pg_advisory_xact_lock');
            if (actor === 'post-patch')
              expect(await cache.get(cacheKey)).toBe(publication.id);
            await fixture.database.control.query('COMMIT');
            const completed = await Promise.all([reader, writer]);
            result = completed[0];
          } finally {
            await fixture.database.control.query('ROLLBACK');
            await Promise.allSettled([reader, ...(writer ? [writer] : [])]);
          }
          expect(result && 'count' in result ? result.count : null).toBe(20);
        }
      } else {
        // The source owner holds exclusive F at a real source-row write.
        const barrier = await installLearningRuntimeBarrier(
          fixture,
          mutationTable(actor),
          target.organizationId,
          actor === 'child-create' ? 'INSERT' : 'UPDATE',
        );
        const writer = mutate(fixture, actor, publication);
        writer.catch(() => undefined);
        let reader: ReturnType<typeof runProjection> | undefined;
        try {
          const held = await barrier.wait(1);
          await assertLearningRuntimeFence(fixture, held.pid, 'ExclusiveLock');
          reader = runProjection(fixture, projection, publication, setup.scope);
          reader.catch(() => undefined);
          const blocked = await waitLearningRuntimeContender(
            fixture,
            0,
            held.pid,
          );
          expect(blocked.query).toContain('pg_advisory_xact_lock');
          if (actor === 'post-patch')
            expect(await cache.get(cacheKey)).toBe(publication.id);
          await barrier.release();
          await writer;
          try {
            result = await reader;
          } catch (error) {
            if (sourcePreserving) throw error;
            ensure(
              error instanceof Error &&
                [
                  'NotFoundException',
                  'BadRequestException',
                  'ConflictException',
                ].includes(error.name),
              'Unexpected projection failure',
            );
          }
        } finally {
          await barrier.release();
          await Promise.allSettled([writer, ...(reader ? [reader] : [])]);
          await barrier.close();
        }
        if (sourcePreserving) {
          if (projection === 'capture')
            expect(
              result && 'validity' in result ? result.validity : null,
            ).toBe('valid');
          else
            expect(result && 'count' in result ? result.count : null).toBe(20);
        } else if (projection === 'capture') expect(result).toBeFalsy();
        else
          expect(result && 'count' in result ? result.count : 0).toBeLessThan(
            20,
          );
      }
      if (actor === 'post-patch') {
        expect(await cache.get(cacheKey)).toBeNull();
        expect(await fixture.resources.clients[2].exists(cacheKey)).toBe(0);
        expect(await cache.get(controlKey)).toBe(publication.id);
      }
      const account =
        await fixture.first.prisma.contentLearningAccount.findFirstOrThrow({
          where: {
            id: target.accountId,
            organizationId: target.organizationId,
          },
        });
      expect(account.evidenceRevision).toBe(
        before.evidenceRevision +
          (sourcePreserving
            ? projection === 'capture'
              ? 1
              : 0
            : projection === 'capture' && ordering === 'projection-first'
              ? 2
              : 1),
      );
      const {
        validLearningCheckpointPublicationV1,
        resolveLearningPublicationSourceV1,
      } = await import(
        '@api/collections/content-learning/services/learning-publication-source.helper'
      );
      const checkpoints =
        await fixture.first.prisma.contentLearningCheckpoint.findMany({
          where: {
            organizationId: target.organizationId,
            postId: publication.id,
            isDeleted: false,
          },
        });
      for (const checkpoint of checkpoints)
        expect(
          await validLearningCheckpointPublicationV1(
            fixture.first.prisma,
            checkpoint,
          ),
        ).toBe(sourcePreserving);
      if (sourcePreserving && projection === 'capture')
        expect(checkpoints).toHaveLength(1);
      if (
        !sourcePreserving &&
        ordering === 'source-first' &&
        projection === 'capture'
      )
        expect(checkpoints).toHaveLength(0);
      if (
        projection === 'materializer' &&
        (ordering === 'projection-first' || sourcePreserving)
      ) {
        ensure(
          result && 'contributorCheckpointIds' in result,
          'Missing real baseline result',
        );
        expect(
          (
            await fixture.first.prisma.contentLearningBaseline.findFirstOrThrow(
              {
                where: {
                  id: result.id,
                  organizationId: target.organizationId,
                  isDeleted: false,
                },
              },
            )
          ).validity,
        ).toBe(sourcePreserving ? 'valid' : 'invalid_source');
      }
      if (sourcePreserving) {
        const refreshed =
          await fixture.first.prisma.credential.findFirstOrThrow({
            where: credentialWhere,
          });
        expect(refreshed).toMatchObject({
          id: originalCredential.id,
          externalId: originalCredential.externalId,
          organizationId: originalCredential.organizationId,
          brandId: originalCredential.brandId,
          platform: originalCredential.platform,
          isConnected: true,
          isDeleted: false,
          externalHandle: 'owned-reconnected',
        });
        expect(refreshed.accessToken).not.toBe(originalCredential.accessToken);
        expect(refreshed.accessTokenSecret).not.toBe(
          originalCredential.accessTokenSecret,
        );
        expect(
          fixture.secondServices.crypto.decrypt(refreshed.accessToken ?? ''),
        ).toBe('owned-reconnected-token');
        expect(
          fixture.secondServices.crypto.decrypt(
            refreshed.accessTokenSecret ?? '',
          ),
        ).toBe('owned-reconnected-secret');
        expect(
          await resolveLearningPublicationSourceV1(
            fixture.first.prisma,
            target.organizationId,
            publication.id,
          ),
        ).toEqual(publication.source);
        for (const edge of retainedDependencies)
          expect(
            await fixture.first.prisma.contentLearningDependency.findFirstOrThrow(
              {
                where: {
                  id: edge.id,
                  sourceOrganizationId: target.organizationId,
                  isDeleted: false,
                },
                select: { id: true, valid: true },
              },
            ),
          ).toEqual(edge);
      }
      if (actor === 'child-create') {
        expect(
          await fixture.first.prisma.post.count({
            where: {
              parentId: publication.id,
              organizationId: target.organizationId,
              isDeleted: false,
            },
          }),
        ).toBe(1);
        expect(
          await resolveLearningPublicationSourceV1(
            fixture.first.prisma,
            target.organizationId,
            publication.id,
          ),
        ).toBeNull();
      }
      expect(await snapshotLearningRuntimeTarget(fixture, victim)).toEqual(
        victimBefore,
      );
    },
  );

  it.each([
    'content_learning_dependencys',
    'content_learning_accounts',
  ] as const)(
    'rolls back actual source mutation when %s invalidation fails',
    async (table) => {
      const target = scenario[0],
        publication = await publishLearningRuntimePost(
          fixture.first,
          fixture.services,
          target,
        );
      expect(
        (await captureLearningRuntimePublication(fixture.services, publication))
          ?.validity,
      ).toBe('valid');
      const before = await snapshotLearningRuntimeTarget(fixture, target);
      const { CacheService } = await import(
        '@api/services/cache/cache.service'
      );
      const cache = fixture.second.module.get(CacheService);
      const cacheKey = `${fixture.resources.prefix}:post-rollback:${randomUUID()}`;
      expect(
        await cache.set(cacheKey, publication.id, { tags: ['post'], ttl: 300 }),
      ).toBe(true);
      expect(await cache.get(cacheKey)).toBe(publication.id);
      const trigger = await installLearningRuntimeFailure(
        fixture,
        table,
        target.organizationId,
        'UPDATE',
      );
      try {
        await expect(
          mutate(fixture, 'post-patch', publication),
        ).rejects.toThrow();
      } finally {
        await trigger.close();
      }
      expect(await snapshotLearningRuntimeTarget(fixture, target)).toEqual(
        before,
      );
      expect(await cache.get(cacheKey)).toBe(publication.id);
    },
  );

  it.each([
    'content_learning_baselines',
    'content_learning_dependencys',
  ] as const)(
    'rolls back baseline creation and all contributor links when %s insert fails',
    async (table) => {
      const target = scenario[0],
        setup = await seedProjection(fixture, 'materializer', target);
      const before = await snapshotLearningRuntimeTarget(fixture, target);
      const trigger = await installLearningRuntimeFailure(
        fixture,
        table,
        target.organizationId,
        'INSERT',
      );
      try {
        await expect(
          fixture.services.materializer.materialize(
            setup.scope.scope,
            setup.scope.descriptor,
            new Date(),
          ),
        ).rejects.toThrow();
      } finally {
        await trigger.close();
      }
      expect(await snapshotLearningRuntimeTarget(fixture, target)).toEqual(
        before,
      );
    },
  );

  it('rolls back provider-confirmed Post state, new immutable association and account revision in the same actual Scheduler transaction', async () => {
    const {
      Platform,
      PostCategory,
      PostFormat,
      PostVisibility,
      TargetExecutionState,
    } = await import('@genfeedai/contracts');
    const target = scenario[0],
      id = randomUUID(),
      externalId = `owned-publication-${id}`;
    await fixture.first.prisma.post.create({
      data: {
        id,
        description: 'Owned atomic publication',
        userId: target.actorId,
        organizationId: target.organizationId,
        brandId: target.brandId,
        credentialId: target.credentialId,
        platform: Platform.TWITTER,
        category: PostCategory.TEXT,
        format: PostFormat.STANDARD,
        visibility: PostVisibility.PUBLIC,
        timezone: 'UTC',
        targetAttachments: [],
        targetSettings: {},
      },
    });
    const approval = await fixture.services.approvals.createForCurrentPost({
      actorUserId: target.actorId,
      organizationId: target.organizationId,
      postId: id,
      mode: 'immediate',
    });
    await fixture.services.approvals.markQueued(
      approval.id,
      target.organizationId,
      target.actorId,
    );
    const lease = await fixture.services.approvals.claimForExecution({
      approvalId: approval.id,
      organizationId: target.organizationId,
      postId: id,
      operationId: approval.operationId,
      versionPinId: approval.artifactVersionPinId,
    });
    ensure(lease.executionStartedAt, 'Missing real approval lease');
    await fixture.first.scheduler.transitionPost(
      { id, organizationId: target.organizationId },
      { executionState: TargetExecutionState.PUBLISHING },
      'Owned atomic transport start',
    );
    const before = await snapshotLearningRuntimeTarget(fixture, target);
    const trigger = await installLearningRuntimeFailure(
      fixture,
      'content_learning_accounts',
      target.organizationId,
      'UPDATE',
    );
    try {
      await expect(
        fixture.first.scheduler.transitionPost(
          { id, organizationId: target.organizationId },
          {
            executionState: TargetExecutionState.PUBLISHED,
            visibility: PostVisibility.PUBLIC,
            externalId,
            publishedAt: new Date(Date.now() - (48 * 60 + 10) * 60000),
          },
          'Owned atomic transport result',
          undefined,
          {
            source: 'learning-runtime-owned-transport',
            result: {
              success: true,
              isProviderDraft: false,
              executionState: TargetExecutionState.PUBLISHED,
              platform: Platform.TWITTER,
              externalId,
            },
          },
        ),
      ).rejects.toThrow();
    } finally {
      await trigger.close();
    }
    expect(await snapshotLearningRuntimeTarget(fixture, target)).toEqual(
      before,
    );
    expect(
      await fixture.first.prisma.postPublishFinalization.count({
        where: { postId: id, organizationId: target.organizationId },
      }),
    ).toBe(0);
    await fixture.services.approvals.completeExecution({
      approvalId: approval.id,
      operationId: approval.operationId,
      organizationId: target.organizationId,
      versionPinId: approval.artifactVersionPinId,
      executionStartedAt: lease.executionStartedAt,
      isSuccessful: false,
    });
  });

  it('rejects stale provider guards without changing timestamps, result, processing markers or evidence counters', async () => {
    const target = scenario[0],
      publication = await publishLearningRuntimePost(
        fixture.first,
        fixture.services,
        target,
      );
    const before = await snapshotLearningRuntimeTarget(fixture, target);
    const { TargetExecutionState } = await import('@genfeedai/contracts');
    expect(
      await fixture.second.scheduler.transitionPost(
        { id: publication.id, organizationId: target.organizationId },
        {
          executionState: TargetExecutionState.PUBLISHING,
          publishedAt: new Date(),
        },
        'Owned stale result',
        { expectedExternalId: 'owned-wrong-provider-id' },
      ),
    ).toBe(false);
    expect(
      await fixture.second.scheduler.transitionPost(
        { id: publication.id, organizationId: target.organizationId },
        {
          executionState: TargetExecutionState.PUBLISHING,
          publishedAt: new Date(),
        },
        'Owned out-of-order result',
        { priorExecutionStates: [TargetExecutionState.PUBLISHING] },
      ),
    ).toBe(false);
    expect(await snapshotLearningRuntimeTarget(fixture, target)).toEqual(
      before,
    );
  });

  it('preserves a legacy outbox without upgrading it into publication authority', async () => {
    const target = scenario[0],
      publication = await publishLearningRuntimePost(
        fixture.first,
        fixture.services,
        target,
        true,
      );
    const { Platform, TargetExecutionState, PostVisibility } = await import(
      '@genfeedai/contracts'
    );
    await fixture.first.prisma.postPublishFinalization.create({
      data: {
        organizationId: target.organizationId,
        postId: publication.id,
        source: 'owned-legacy-negative',
        result: {
          success: true,
          externalId: publication.externalId,
          platform: Platform.TWITTER,
        },
      },
    });
    const before =
      await fixture.first.prisma.postPublishFinalization.findFirstOrThrow({
        where: {
          postId: publication.id,
          organizationId: target.organizationId,
        },
      });
    await fixture.second.scheduler.transitionPost(
      { id: publication.id, organizationId: target.organizationId },
      {
        executionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
        externalId: publication.externalId,
        publishedAt: publication.publishedAt,
      },
      'Owned repeated legacy confirmation',
      undefined,
      {
        source: 'learning-runtime-owned-transport',
        result: {
          success: true,
          isProviderDraft: false,
          executionState: TargetExecutionState.PUBLISHED,
          platform: Platform.TWITTER,
          externalId: publication.externalId,
        },
      },
    );
    expect(
      await fixture.first.prisma.postPublishFinalization.findFirstOrThrow({
        where: {
          postId: publication.id,
          organizationId: target.organizationId,
        },
      }),
    ).toEqual(before);
    const { resolveLearningPublicationSourceV1 } = await import(
      '@api/collections/content-learning/services/learning-publication-source.helper'
    );
    expect(
      await resolveLearningPublicationSourceV1(
        fixture.first.prisma,
        target.organizationId,
        publication.id,
      ),
    ).toBeNull();
  });

  it('observes real F-before-account and account-before-source contention without a table-lock proxy', async () => {
    const target = scenario[0],
      publication = await publishLearningRuntimePost(
        fixture.first,
        fixture.services,
        target,
      );
    await fixture.database.control.query('BEGIN');
    await fixture.database.observer.query('BEGIN');
    await fixture.database.control.query(
      'SELECT id FROM content_learning_accounts WHERE id=$1 AND "organizationId"=$2 FOR UPDATE',
      [target.accountId, target.organizationId],
    );
    await fixture.database.observer.query(
      'SELECT id FROM posts WHERE id=$1 AND "organizationId"=$2 FOR UPDATE',
      [publication.id, target.organizationId],
    );
    const accountPid = Number(
        (await fixture.database.control.query('SELECT pg_backend_pid() AS pid'))
          .rows[0].pid,
      ),
      sourcePid = Number(
        (
          await fixture.database.observer.query(
            'SELECT pg_backend_pid() AS pid',
          )
        ).rows[0].pid,
      );
    const capture = captureLearningRuntimePublication(
      fixture.services,
      publication,
    );
    capture.catch(() => undefined);
    try {
      const account = await waitLearningRuntimeContender(
        fixture,
        0,
        accountPid,
      );
      expect(account.query).toContain('content_learning_accounts');
      await assertLearningRuntimeFence(fixture, account.pid, 'ShareLock');
      await fixture.database.control.query('COMMIT');
      const source = await waitLearningRuntimeContender(fixture, 0, sourcePid);
      expect(source.query).toContain('posts');
      expect(source.query).toContain('FOR UPDATE');
      await assertLearningRuntimeFence(fixture, source.pid, 'ShareLock');
      await fixture.database.observer.query('COMMIT');
      expect((await capture)?.validity).toBe('valid');
    } finally {
      await fixture.database.control.query('ROLLBACK');
      await fixture.database.observer.query('ROLLBACK');
      await Promise.allSettled([capture]);
    }
  });

  it('rejects stale preread sources and cross-tenant identity collisions without victim evidence writes', async () => {
    const [target, victim] = scenario,
      publication = await publishLearningRuntimePost(
        fixture.first,
        fixture.services,
        target,
      );
    const victimPublication = await publishLearningRuntimePost(
      fixture.first,
      fixture.services,
      victim,
    );
    const victimBefore = await snapshotLearningRuntimeTarget(fixture, victim);
    const { runWithTenantContext } = await import(
      '@libs/prisma/tenant-context'
    );
    await runWithTenantContext(
      { organizationId: target.organizationId },
      async () => {
        await expect(
          fixture.secondServices.posts.patch(victimPublication.id, {
            description: 'Denied foreign edit',
          }),
        ).rejects.toThrow();
        await expect(
          fixture.secondServices.posts.remove(victimPublication.id),
        ).resolves.toBeNull();
        await expect(
          fixture.secondServices.credentials.patch(victim.credentialId, {
            isConnected: false,
          }),
        ).rejects.toThrow();
        await expect(
          fixture.secondServices.credentials.remove(victim.credentialId),
        ).resolves.toBeNull();
        await expect(
          fixture.secondServices.brands.patch(victim.brandId, {
            isActive: false,
          }),
        ).rejects.toThrow();
        await expect(
          fixture.secondServices.brandLifecycle.remove(
            target.organizationId,
            victim.brandId,
          ),
        ).rejects.toThrow();
      },
    );
    await mutate(fixture, 'post-patch', publication);
    const account =
      await fixture.first.prisma.contentLearningAccount.findFirstOrThrow({
        where: { id: target.accountId, organizationId: target.organizationId },
      });
    expect(
      await captureLearningRuntimePublication(fixture.services, publication),
    ).toBeNull();
    expect(
      (
        await fixture.first.prisma.contentLearningAccount.findFirstOrThrow({
          where: {
            id: target.accountId,
            organizationId: target.organizationId,
          },
        })
      ).evidenceRevision,
    ).toBe(account.evidenceRevision);
    ensure(publication.source, 'Missing actual preread source');
    await expect(
      fixture.services.capture.capture({
        publicationSource: publication.source,
        organizationId: victim.organizationId,
        credentialId: victim.credentialId,
        postId: publication.id,
        publishedAt: publication.publishedAt,
        requestStartedAt: new Date(),
        receivedAt: new Date(),
        sourceAttemptId: randomUUID(),
        format: 'text',
        objective: 'engagement',
        learningMetrics: await (
          await import('./content-learning-runtime.fixture')
        ).learningRuntimeMetrics(),
      }),
    ).resolves.toBeNull();
    expect(await snapshotLearningRuntimeTarget(fixture, victim)).toEqual(
      victimBefore,
    );
  });

  it('fails the actual validator after one of the eight real source edges is corrupted', async () => {
    const target = scenario[0],
      publication = await publishLearningRuntimePost(
        fixture.first,
        fixture.services,
        target,
      ),
      checkpoint = await captureLearningRuntimePublication(
        fixture.services,
        publication,
      );
    ensure(checkpoint, 'Missing real checkpoint');
    const { validLearningCheckpointPublicationV1 } = await import(
      '@api/collections/content-learning/services/learning-publication-source.helper'
    );
    expect(
      await validLearningCheckpointPublicationV1(
        fixture.first.prisma,
        checkpoint,
      ),
    ).toBe(true);
    const edges = await fixture.first.prisma.contentLearningDependency.findMany(
      {
        where: {
          derivedKind: 'checkpoint',
          derivedId: checkpoint.id,
          derivedOrganizationId: target.organizationId,
          isDeleted: false,
        },
      },
    );
    expect(edges).toHaveLength(8);
    await fixture.first.prisma.contentLearningDependency.update({
      where: { id: edges[0].id },
      data: { sourceVersion: 'owned-corrupt-version' },
    });
    expect(
      await validLearningCheckpointPublicationV1(
        fixture.first.prisma,
        checkpoint,
      ),
    ).toBe(false);
  });

  it('rejects actual child creation against an EXECUTING parent lease even when its current approval pointer is null', async () => {
    const target = scenario[0],
      id = randomUUID();
    const { Platform, PostCategory, PostFormat } = await import(
      '@genfeedai/contracts'
    );
    await fixture.first.prisma.post.create({
      data: {
        id,
        description: 'Owned protected parent',
        organizationId: target.organizationId,
        brandId: target.brandId,
        credentialId: target.credentialId,
        userId: target.actorId,
        platform: Platform.TWITTER,
        category: PostCategory.TEXT,
        format: PostFormat.STANDARD,
        timezone: 'UTC',
        targetSettings: {},
        targetAttachments: [],
      },
    });
    const approval = await fixture.services.approvals.createForCurrentPost({
      actorUserId: target.actorId,
      organizationId: target.organizationId,
      postId: id,
      mode: 'immediate',
    });
    await fixture.services.approvals.markQueued(
      approval.id,
      target.organizationId,
      target.actorId,
    );
    const lease = await fixture.services.approvals.claimForExecution({
      approvalId: approval.id,
      organizationId: target.organizationId,
      postId: id,
      operationId: approval.operationId,
      versionPinId: approval.artifactVersionPinId,
    });
    ensure(lease.executionStartedAt, 'Missing actual executing lease');
    // Negative corruption fixture only: authority itself comes from the real claim.
    await fixture.first.prisma.post.update({
      where: { id, organizationId: target.organizationId },
      data: { publishApprovalId: null },
    });
    const before = await snapshotLearningRuntimeTarget(fixture, target);
    await expect(
      mutate(fixture, 'child-create', {
        id,
        externalId: '',
        publishedAt: new Date(),
        target,
        source: null,
      }),
    ).rejects.toThrow();
    expect(await snapshotLearningRuntimeTarget(fixture, target)).toEqual(
      before,
    );
    expect(
      await fixture.first.prisma.post.count({
        where: {
          parentId: id,
          organizationId: target.organizationId,
          isDeleted: false,
        },
      }),
    ).toBe(0);
    await fixture.services.approvals.completeExecution({
      approvalId: approval.id,
      operationId: approval.operationId,
      organizationId: target.organizationId,
      versionPinId: approval.artifactVersionPinId,
      executionStartedAt: lease.executionStartedAt,
      isSuccessful: false,
    });
  });
});
