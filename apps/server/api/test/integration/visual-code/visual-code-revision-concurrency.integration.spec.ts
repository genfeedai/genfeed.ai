import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VisualProjectDispatchService } from '@api/collections/visual-projects/services/visual-project-dispatch.service';
import { VisualProjectsService } from '@api/collections/visual-projects/services/visual-projects.service';
import type { IVisualCodeSettings } from '@genfeedai/contracts/interfaces';
import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createVisualCodeAcceptanceFixture,
  seedVisualCodeAcceptanceActor,
  type VisualCodeAcceptanceActor,
  type VisualCodeAcceptanceFixture,
} from './visual-code-acceptance.fixture';

const response = z.object({ data: z.object({ id: z.string() }) });
const quoteResponse = z.object({
  data: z.object({ attributes: z.object({ maximumCredits: z.number() }) }),
});
const settings: IVisualCodeSettings = {
  width: 640,
  height: 360,
  fps: 30,
  durationFrames: 30,
};
const outputs = [
  { format: 'mp4' as const },
  { format: 'png' as const, frame: 0 },
];

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// Read only explicitly permitted properties; never serialize error messages,
// arbitrary metadata, SQL values, stack locals, or connection information.
function errorMetadata(error: unknown) {
  const fields: Record<string, string> = {};
  const visit = (value: unknown, path: string, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 5) return;
    for (const key of [
      'code',
      'sqlState',
      'sqlstate',
      'originalCode',
      'constraint',
      'constraintName',
    ]) {
      const field: unknown = Reflect.get(value, key);
      if (typeof field === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(field))
        fields[`${path}.${key}`] = field;
    }
    for (const key of ['cause', 'meta', 'driverAdapterError', 'originalError'])
      visit(Reflect.get(value, key), `${path}.${key}`, depth + 1);
  };
  visit(error, 'error', 0);
  return {
    constructor: error instanceof Error ? error.constructor.name : typeof error,
    name: error instanceof Error ? error.name : null,
    fields,
  };
}

async function snapshot(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
) {
  const where = { organizationId: actor.organizationId, isDeleted: false };
  const [
    projects,
    revisions,
    ingredients,
    reservations,
    executions,
    transactions,
  ] = await Promise.all([
    f.prisma.visualProject.findMany({ where, orderBy: { id: 'asc' } }),
    f.prisma.visualRevision.findMany({ where, orderBy: { id: 'asc' } }),
    f.prisma.ingredient.findMany({
      where,
      orderBy: { id: 'asc' },
      include: { metadata: true },
    }),
    f.prisma.creditReservation.findMany({ where, orderBy: { id: 'asc' } }),
    f.prisma.workflowExecution.findMany({ where, orderBy: { id: 'asc' } }),
    f.prisma.creditTransaction.findMany({ where, orderBy: { id: 'asc' } }),
  ]);
  return {
    projects,
    revisions,
    ingredients,
    reservations,
    executions,
    transactions,
    wallet: await f.credits.getWalletSnapshot(actor.organizationId),
    jobs: [...f.queues.values()]
      .flatMap((queue) => [...queue.jobs.keys()])
      .sort(),
  };
}

type FailureStage = 'prepare' | 'createNextRevision' | 'dispatch';
function observe(
  target: object,
  method: string,
  onEnter: () => void,
  onError: (error: unknown) => void,
) {
  const original: unknown = Reflect.get(target, method);
  if (typeof original !== 'function')
    throw new Error(`Missing diagnostic boundary ${method}`);
  const ownDescriptor = Object.getOwnPropertyDescriptor(target, method);
  Object.defineProperty(target, method, {
    configurable: true,
    value: async function (this: object, ...args: unknown[]) {
      onEnter();
      try {
        return await Reflect.apply(original, this, args);
      } catch (error) {
        onError(error);
        throw error;
      }
    },
  });
  return () => {
    if (ownDescriptor) Object.defineProperty(target, method, ownDescriptor);
    else Reflect.deleteProperty(target, method);
  };
}

describe('diagnostic boundary restoration', () => {
  it('restores an instance-bound method and its original descriptor', async () => {
    const target = {};
    const original = async () => 'original';
    Object.defineProperty(target, 'method', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: original,
    });
    const descriptor = Object.getOwnPropertyDescriptor(target, 'method');
    const restore = observe(
      target,
      'method',
      () => {},
      () => {},
    );
    expect(await Reflect.apply(Reflect.get(target, 'method'), target, [])).toBe(
      'original',
    );
    restore();
    expect(Object.getOwnPropertyDescriptor(target, 'method')).toEqual(
      descriptor,
    );
  });

  it('removes the temporary override of an inherited method', () => {
    class Boundary {
      async method() {
        return 'original';
      }
    }
    const target = new Boundary();
    const original = target.method;
    const restore = observe(
      target,
      'method',
      () => {},
      () => {},
    );
    expect(Object.hasOwn(target, 'method')).toBe(true);
    restore();
    expect(Object.hasOwn(target, 'method')).toBe(false);
    expect(Reflect.get(target, 'method')).toBe(original);
  });
});

describe('real Postgres visual revision concurrency (captured transports)', () => {
  const pairs = Number(process.env.VISUAL_REVISION_DIAGNOSTIC_PAIRS ?? 1);
  if (!Number.isInteger(pairs) || pairs < 1 || pairs > 10)
    throw new Error('Diagnostic pair limit is 1–10');
  for (let pair = 1; pair <= pairs; pair++) {
    it(`records exact losing boundary and immutable history (pair ${pair})`, async () => {
      const directory = process.env.VISUAL_REVISION_DIAGNOSTIC_DIRECTORY;
      if (directory) await mkdir(directory, { recursive: true, mode: 0o700 });
      const f = await createVisualCodeAcceptanceFixture();
      try {
        const actor = await seedVisualCodeAcceptanceActor(f);
        const quote = async (
          operation: 'create' | 'revise' | 'export',
          input: Record<string, unknown>,
          projectId?: string,
        ) =>
          quoteResponse.parse(
            await f.controller.quote(f.request(actor.user), actor.user, {
              operation,
              input,
              ...(projectId ? { projectId } : {}),
            }),
          ).data.attributes.maximumCredits;
        const input = {
          brandId: actor.brandId,
          requestId: `create-${randomUUID()}`,
          label: 'Revision race',
          prompt: 'Animate a title',
          modelKey: f.paidModel,
          settings,
          sourceAssetIds: [actor.sourceAssetId],
          outputs,
        };
        const projectId = response.parse(
          await f.controller.create(f.request(actor.user), actor.user, {
            ...input,
            maximumCredits: await quote('create', input),
          }),
        ).data.id;
        await f.drainNextWorkflowJob();
        const change = {
          requestId: `props-${randomUUID()}`,
          expectedRevision: 1,
          props: { title: 'Revised title' },
        };
        await f.controller.revise(
          f.request(actor.user),
          actor.user,
          projectId,
          {
            ...change,
            maximumCredits: await quote('revise', change, projectId),
          },
        );
        await f.drainNextWorkflowJob();
        const exportInput = {
          requestId: `export-${randomUUID()}`,
          revision: 2,
          expectedRevision: 2,
          outputs: outputs.slice(1),
        };
        await f.controller.export(
          f.request(actor.user),
          actor.user,
          projectId,
          {
            ...exportInput,
            maximumCredits: await quote('export', exportInput, projectId),
          },
        );
        await f.drainNextWorkflowJob();
        const before = await snapshot(f, actor);
        expect(before.projects[0]?.currentRevision).toBe(3);
        const requestA = `race-a-${randomUUID()}`;
        const requestB = `race-b-${randomUUID()}`;
        const raceInput = {
          requestId: requestA,
          expectedRevision: 3,
          props: { title: 'Concurrent winner' },
        };
        const maximumCredits = await quote('revise', raceInput, projectId);
        const failures = new Map<unknown, FailureStage>();
        let transactionAttempts = 0;
        const transactionFailures: ReturnType<typeof errorMetadata>[] = [];
        const restores = [
          observe(
            f.moduleRef.get(VisualProjectsService),
            'prepare',
            () => {},
            (error) => failures.set(error, 'prepare'),
          ),
          observe(
            f.moduleRef.get(VisualProjectsService),
            'createNextRevision',
            () => {},
            (error) => failures.set(error, 'createNextRevision'),
          ),
          observe(
            f.moduleRef.get(VisualProjectDispatchService),
            'dispatch',
            () => {},
            (error) => failures.set(error, 'dispatch'),
          ),
          observe(
            f.prisma,
            '$transaction',
            () => {
              transactionAttempts++;
            },
            (error) => transactionFailures.push(errorMetadata(error)),
          ),
        ];
        let raced: PromiseSettledResult<unknown>[];
        try {
          raced = await Promise.allSettled([
            f.controller.revise(f.request(actor.user), actor.user, projectId, {
              ...raceInput,
              maximumCredits,
            }),
            f.controller.revise(f.request(actor.user), actor.user, projectId, {
              ...raceInput,
              requestId: requestB,
              maximumCredits,
            }),
          ]);
        } finally {
          for (const restore of restores) restore();
        }
        const after = await snapshot(f, actor);
        const priorIds = new Set(before.revisions.map((row) => row.id));
        const priorUnchanged =
          digest(after.revisions.filter((row) => priorIds.has(row.id))) ===
          digest(before.revisions);
        const refused = raced.find((result) => result.status === 'rejected');
        const ledger = {
          revisionsAdded: after.revisions.length - before.revisions.length,
          currentRevision: after.projects[0]?.currentRevision,
          reservationsAdded:
            after.reservations.length - before.reservations.length,
          executionsAdded: after.executions.length - before.executions.length,
          capturedJobsAdded: after.jobs.length - before.jobs.length,
          transactionsAdded:
            after.transactions.length - before.transactions.length,
          ingredientsUnchanged:
            digest(after.ingredients) === digest(before.ingredients),
          priorRevisionsUnchanged: priorUnchanged,
          walletBefore: before.wallet,
          walletAfter: after.wallet,
        };
        const diagnostic = {
          head: process.env.VISUAL_REVISION_DIAGNOSTIC_HEAD ?? null,
          testName: 'visual revision race',
          pair,
          node: process.version,
          prisma: process.env.VISUAL_REVISION_DIAGNOSTIC_PRISMA_VERSION ?? null,
          adapter:
            process.env.VISUAL_REVISION_DIAGNOSTIC_ADAPTER_VERSION ?? null,
          requestLabels: ['a', 'b'],
          outcomes: raced.map((result) => result.status),
          stage:
            refused?.status === 'rejected'
              ? (failures.get(refused.reason) ?? null)
              : null,
          totalObservedTransactionAttempts: transactionAttempts,
          transactionFailures,
          error:
            refused?.status === 'rejected'
              ? errorMetadata(refused.reason)
              : null,
          priorSnapshotHash: digest(before),
          ledger,
        };
        if (directory) {
          const artifact = join(
            directory,
            `pair-${String(pair).padStart(2, '0')}.json`,
          );
          await writeFile(artifact, JSON.stringify(diagnostic, null, 2), {
            mode: 0o600,
            flag: 'wx',
          });
        }
        expect(
          raced.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(refused?.status).toBe('rejected');
        if (refused?.status !== 'rejected')
          throw new Error('Revision refusal absent');
        expect(refused.reason).toBeInstanceOf(HttpException);
        expect(refused.reason.getStatus()).toBe(409);
        expect(ledger.revisionsAdded).toBe(1);
        expect(ledger.currentRevision).toBe(4);
        expect(ledger.reservationsAdded).toBe(1);
        expect(ledger.executionsAdded).toBe(1);
        expect(ledger.capturedJobsAdded).toBe(1);
        expect(ledger.transactionsAdded).toBe(0);
        expect(ledger.ingredientsUnchanged).toBe(true);
        expect(priorUnchanged).toBe(true);
        expect(after.wallet.settled).toBe(before.wallet.settled);
        const loser = raced[0]?.status === 'rejected' ? requestA : requestB;
        expect(
          after.revisions.filter((row) => row.requestId === loser),
        ).toHaveLength(0);
        const winner = loser === requestA ? requestB : requestA;
        await f.drainNextWorkflowJob();
        const completed = await snapshot(f, actor);
        expect(
          completed.revisions.filter((row) => priorIds.has(row.id)),
        ).toEqual(before.revisions);
        await f.controller.revise(
          f.request(actor.user),
          actor.user,
          projectId,
          {
            ...raceInput,
            requestId: winner,
            maximumCredits,
          },
        );
        expect(digest(await snapshot(f, actor))).toBe(digest(completed));
        await expect(
          f.controller.revise(f.request(actor.user), actor.user, projectId, {
            ...raceInput,
            requestId: loser,
            maximumCredits,
          }),
        ).rejects.toMatchObject({ status: 409 });
        expect(digest(await snapshot(f, actor))).toBe(digest(completed));
      } finally {
        await f.close();
      }
    }, 30000);
  }
});
