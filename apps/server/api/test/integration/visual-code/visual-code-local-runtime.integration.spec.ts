import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { inspect, isDeepStrictEqual, promisify } from 'node:util';
import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import type { CreateVisualProjectDto } from '@api/collections/visual-projects/dto/create-visual-project.dto';
import {
  createTestBrand,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import {
  CreditReservationStatus,
  IngredientCategory,
  IngredientStatus,
  VisualCodeStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { VISUAL_CODE_RENDERER_VERSION } from '@genfeedai/contracts/constants';
import type { IVisualCodeSettings } from '@genfeedai/contracts/interfaces';
import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/contracts/queue';
import type { VisualRevision } from '@genfeedai/prisma';
import { HttpException } from '@nestjs/common';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createVisualCodeAcceptanceFixture,
  readVisualRuntimePreflight,
  runVisualCodeCleanupSteps,
  seedVisualCodeAcceptanceActor,
  type VisualCodeAcceptanceActor,
  type VisualCodeAcceptanceFixture,
  VisualCodeCleanupError,
  type VisualCodeCleanupStep,
  type VisualCodeRuntimeFixture,
  type VisualCodeScriptedScenario,
} from './visual-code-acceptance.fixture';

const exec = promisify(execFile);
const hash = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
const SETTINGS: IVisualCodeSettings = {
  width: 640,
  height: 360,
  fps: 30,
  durationFrames: 30,
};
const OUTPUTS = [
  { format: 'mp4' as const },
  { format: 'png' as const, frame: 0 },
  { format: 'jpeg' as const, frame: 15 },
];
const outputSchema = z.array(
  z.object({
    ingredientId: z.string(),
    format: z.string(),
    frame: z.number().optional(),
  }),
);
const responseSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z
      .object({
        revisions: z.array(
          z
            .object({
              id: z.string(),
              status: z.string(),
              sourceHash: z.string().nullable(),
              hasSource: z.boolean(),
              outputs: outputSchema,
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  }),
});
const receiptSchema = z.array(
  z
    .object({
      kind: z.string(),
      state: z.string(),
      isResultApplied: z.boolean(),
      credits: z.number(),
      operatorCredits: z.number(),
    })
    .passthrough(),
);
let fixture: VisualCodeAcceptanceFixture | undefined;
let scenarioDeadline = 0;
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing explicit ${name}`);
  return value;
}
function runtime(f: VisualCodeAcceptanceFixture): VisualCodeRuntimeFixture {
  if (!f.runtime) throw new Error('Real transport fixture absent');
  return f.runtime;
}
async function setup(scenario: VisualCodeScriptedScenario) {
  const root = required('VISUAL_CODE_LOCAL_ARTIFACT_DIR');
  if (!isAbsolute(root)) throw new Error('Artifact root must be absolute');
  await readVisualRuntimePreflight(root);
  const options = {
    rendererUrl: required('VISUAL_CODE_LOCAL_RENDERER_URL'),
    rendererToken: required('VISUAL_CODE_LOCAL_RENDERER_TOKEN'),
    redisUrl: required('VISUAL_CODE_LOCAL_REDIS_URL'),
    mediaDirectory: required('VISUAL_CODE_LOCAL_MEDIA_DIR'),
    artifactDirectory: join(root, `${scenario}-${randomUUID()}`),
    scenario,
  };
  await mkdir(options.artifactDirectory, { mode: 0o700 });
  fixture = await createVisualCodeAcceptanceFixture({
    rendererEnabled: 'true',
    runtime: options,
  });
  return fixture;
}
function input(actor: VisualCodeAcceptanceActor): CreateVisualProjectDto {
  return {
    brandId: actor.brandId,
    requestId: `create-${randomUUID()}`,
    label: 'Hybrid acceptance',
    prompt: 'Image and video halves with audio and visible title',
    modelKey: 'openai/visual-acceptance',
    settings: SETTINGS,
    sourceAssetIds: actor.sourceAssetIds,
    outputs: OUTPUTS,
    maximumCredits: 1,
  };
}
async function quote(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
  operation: 'create' | 'revise' | 'export',
  raw: Record<string, unknown>,
  projectId?: string,
) {
  const { maximumCredits: _maximum, ...parameters } = raw;
  return z
    .object({
      data: z.object({
        attributes: z.object({ maximumCredits: z.number().positive() }),
      }),
    })
    .parse(
      await f.controller.quote(f.request(actor.user), actor.user, {
        operation,
        ...(operation === 'create' ? {} : { projectId }),
        input: parameters,
      }),
    ).data.attributes.maximumCredits;
}
async function revisions(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
  projectId?: string,
) {
  return f.prisma.visualRevision.findMany({
    where: {
      organizationId: actor.organizationId,
      isDeleted: false,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { number: 'asc' },
  });
}
async function create(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
) {
  const quoteInput = input(actor);
  const parameters: CreateVisualProjectDto = {
    ...quoteInput,
    maximumCredits: await quote(f, actor, 'create', { ...quoteInput }),
  };
  const response = responseSchema.parse(
    await f.controller.create(f.request(actor.user), actor.user, parameters),
  );
  return { parameters, projectId: response.data.id };
}
async function queued(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
  projectId: string,
) {
  const revision = (await revisions(f, actor, projectId)).at(-1);
  if (!revision) throw new Error('Queued revision absent');
  expect(revision.status).toBe(VisualCodeStatus.QUEUED);
  const queue = runtime(f).queues.get(WORKFLOW_EXECUTION_QUEUE);
  if (!queue) throw new Error('Actual queue absent');
  const jobs = await queue.getJobs(['waiting', 'active']);
  expect(jobs).toHaveLength(1);
  const job = jobs[0];
  if (!job?.id) throw new Error('Actual job ID absent');
  expect(job.name).toBe('system-run');
  expect(job.data.systemRun?.input.canonicalId).toBe('visual-code.execute');
  const execution = await f.prisma.workflowExecution.findFirstOrThrow({
    where: {
      id: revision.workflowExecutionId ?? '',
      organizationId: actor.organizationId,
      isDeleted: false,
    },
    include: { workflowVersion: true },
  });
  expect(execution.workflowVersionId).toBe(execution.workflowVersion.id);
  expect(execution.workflowVersion.graph).toMatchObject({
    nodes: [
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            actionId: 'visual-code.execute-internal',
          }),
        }),
      }),
    ],
  });
  const reservation = await f.prisma.creditReservation.findFirstOrThrow({
    where: {
      id: revision.reservationId ?? '',
      organizationId: actor.organizationId,
      isDeleted: false,
    },
  });
  expect(reservation.status).toBe(CreditReservationStatus.RESERVED);
  expect(reservation.amount).toBe(revision.maximumCredits);
  return { job, revision };
}
async function run(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
  projectId: string,
) {
  const pending = await queued(f, actor, projectId);
  await runtime(f).startWorker();
  await runtime(f).waitForJob(pending.job.id ?? '');
  const revision = (await revisions(f, actor, projectId)).find(
    (r) => r.id === pending.revision.id,
  );
  if (!revision) throw new Error('Terminal revision absent');
  return { jobId: pending.job.id ?? '', revision };
}
async function settlement(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
  revision: VisualRevision,
) {
  const receipts = receiptSchema.parse(revision.receipts);
  expect(
    receipts.filter((r) => r.kind === 'settlement' && r.state === 'confirmed'),
  ).toHaveLength(1);
  expect(revision.consumedCredits).toBeLessThanOrEqual(revision.maximumCredits);
  expect(
    receipts
      .filter((r) => r.state === 'confirmed' && r.kind !== 'settlement')
      .reduce((sum, r) => sum + r.credits, 0),
  ).toBeCloseTo(revision.consumedCredits, 8);
  expect(receipts.every((r) => r.operatorCredits >= 0)).toBe(true);
  const reservation = await f.prisma.creditReservation.findFirstOrThrow({
    where: {
      id: revision.reservationId ?? '',
      organizationId: actor.organizationId,
      isDeleted: false,
    },
  });
  expect(reservation.status).toBe(CreditReservationStatus.SETTLED);
  expect(reservation.settledAmount).toBeCloseTo(revision.consumedCredits, 8);
  const transactions = await f.prisma.creditTransaction.findMany({
    where: {
      organizationId: actor.organizationId,
      reservationId: reservation.id,
      isDeleted: false,
    },
  });
  expect(transactions).toHaveLength(revision.consumedCredits > 0 ? 1 : 0);
  expect(transactions.reduce((sum, r) => sum + r.amount, 0)).toBeCloseTo(
    revision.consumedCredits,
    8,
  );
  expect((await f.credits.getWalletSnapshot(actor.organizationId)).held).toBe(
    0,
  );
  runtime(f).assertions.push(`settlement:${revision.id}`);
}
async function libraryIds(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
) {
  const query = new IngredientsQueryDto();
  query.brandId = actor.brandId;
  query.status = [IngredientStatus.GENERATED];
  query.limit = 100;
  return z
    .object({ data: z.array(z.object({ id: z.string() })) })
    .parse(
      await f.library.findAll(
        f.request(actor.user, '/ingredients'),
        query,
        actor.user,
      ),
    )
    .data.map((row) => row.id);
}
async function media(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
  revision: VisualRevision,
) {
  expect(revision.status).toBe(VisualCodeStatus.COMPLETED);
  expect(revision.rendererVersion).toBe(VISUAL_CODE_RENDERER_VERSION);
  expect(revision.sourceHash).toBe(hash(revision.sourceCode ?? ''));
  const outputs = outputSchema.parse(revision.outputs);
  expect(new Set(outputs.map((o) => o.ingredientId)).size).toBe(outputs.length);
  const rows = await f.prisma.ingredient.findMany({
    where: {
      id: { in: outputs.map((o) => o.ingredientId) },
      organizationId: actor.organizationId,
      isDeleted: false,
    },
    include: { metadata: true },
  });
  expect(rows).toHaveLength(outputs.length);
  const files: Record<string, string> = {};
  for (const row of rows) {
    expect(row.brandId).toBe(actor.brandId);
    expect(row.userId).toBe(actor.userId);
    expect(row.status).toBe(IngredientStatus.GENERATED);
    expect(row.generationSource).toBe(
      `visual-code:${revision.projectId}@${revision.number}`,
    );
    expect(row.sourceActionId).toBe('visual-code.generate');
    const bytes = await readFile(
      join(runtime(f).directory, 'storage', row.s3Key ?? ''),
    );
    files[row.id] = hash(bytes);
    expect(row.fileSize).toBe(bytes.length);
    expect(row.metadata?.size).toBe(bytes.length);
    const provenance = z
      .object({
        sourceHash: z.string(),
        outputHash: z.string(),
        sourceAssetIds: z.array(z.string()),
        rendererVersion: z.string(),
      })
      .parse(row.providerData);
    expect(provenance.sourceHash).toBe(revision.sourceHash);
    expect(provenance.outputHash).toBe(hash(bytes));
    expect(provenance.sourceAssetIds).toEqual(actor.sourceAssetIds);
    expect(provenance.rendererVersion).toBe(VISUAL_CODE_RENDERER_VERSION);
    const output = outputs.find((o) => o.ingredientId === row.id);
    if (!output) throw new Error('Output identity absent');
    const path = join(
      runtime(f).directory,
      `${revision.id}-${row.id}.${output.format}`,
    );
    await writeFile(path, bytes);
    if (output.format === 'mp4') {
      const remainingMs = scenarioDeadline - Date.now();
      if (remainingMs <= 0)
        throw new Error('Scenario deadline exceeded before ffprobe');
      const probe = JSON.parse(
        (
          await exec(
            'ffprobe',
            [
              '-v',
              'error',
              '-show_streams',
              '-show_format',
              '-of',
              'json',
              path,
            ],
            {
              timeout: Math.min(30000, remainingMs),
              maxBuffer: 1048576,
              killSignal: 'SIGKILL',
            },
          )
        ).stdout,
      ) as {
        streams: {
          codec_type: string;
          codec_name: string;
          width?: number;
          height?: number;
          avg_frame_rate?: string;
          duration?: string;
          nb_frames?: string;
        }[];
        format: { duration: string };
      };
      await writeFile(
        join(runtime(f).directory, `${revision.id}-ffprobe.json`),
        JSON.stringify(probe, null, 2),
      );
      const video = probe.streams.filter((s) => s.codec_type === 'video');
      const audio = probe.streams.filter((s) => s.codec_type === 'audio');
      expect(video).toHaveLength(1);
      expect(audio).toHaveLength(1);
      expect(video[0]).toMatchObject({
        codec_name: 'h264',
        width: 640,
        height: 360,
        avg_frame_rate: '30/1',
      });
      expect(audio[0]?.codec_name).toBe('aac');
      expect(typeof video[0]?.duration).toBe('string');
      const videoDuration = Number(video[0]?.duration);
      expect(Number.isFinite(videoDuration)).toBe(true);
      expect(
        Math.abs(videoDuration - SETTINGS.durationFrames / SETTINGS.fps),
      ).toBeLessThanOrEqual(1 / SETTINGS.fps + 0.001);
      expect(Number(video[0]?.nb_frames)).toBe(SETTINGS.durationFrames);
    } else {
      const { data, info } = await sharp(bytes)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(640);
      expect(info.height).toBe(360);
      for (const [x, channel] of [
        [80, 1],
        [560, 2],
      ] as const) {
        const offset = (300 * info.width + x) * info.channels;
        const color = Array.from(data.subarray(offset, offset + 3));
        const dominant = color[channel] ?? 0;
        expect(dominant).toBeGreaterThan(100);
        for (const [index, value] of color.entries())
          if (index !== channel) expect(dominant).toBeGreaterThan(value * 1.5);
      }
    }
    expect(await libraryIds(f, actor)).toContain(row.id);
  }
  const execution = await f.prisma.workflowExecution.findFirstOrThrow({
    where: {
      id: revision.workflowExecutionId ?? '',
      organizationId: actor.organizationId,
      isDeleted: false,
    },
  });
  expect(execution.status).toBe(WorkflowExecutionStatus.COMPLETED);
  const claims = await f.prisma.workflowNodeClaim.findMany({
    where: { executionId: execution.id, organizationId: actor.organizationId },
  });
  expect(claims).toHaveLength(1);
  expect(claims[0]?.status).toBe('completed');
  expect(f.calls.liveClaims).toContain(claims[0]?.id);
  runtime(f).assertions.push(`media-lineage:${revision.id}`);
  return files;
}
async function immutable(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
  revision: VisualRevision,
) {
  const current = (await revisions(f, actor, revision.projectId)).find(
    (r) => r.id === revision.id,
  );
  if (!current) throw new Error('Original revision absent');
  const ids = outputSchema.parse(current.outputs).map((o) => o.ingredientId);
  const rows = await f.prisma.ingredient.findMany({
    where: {
      id: { in: ids },
      organizationId: actor.organizationId,
      isDeleted: false,
    },
    orderBy: { id: 'asc' },
  });
  return {
    sourceCode: current.sourceCode,
    props: current.props,
    sourceHash: current.sourceHash,
    outputs: current.outputs,
    files: await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        sha256: hash(
          await readFile(join(runtime(f).directory, 'storage', r.s3Key ?? '')),
        ),
      })),
    ),
  };
}
const ingredientInspectionSymbol = Symbol.for('nodejs.util.inspect.custom');
function ingredientSnapshot<T extends object>(row: T): T {
  const result = {} as T;
  for (const key of Reflect.ownKeys(row)) {
    const descriptor = Object.getOwnPropertyDescriptor(row, key);
    if (!descriptor) throw new Error('Ingredient own-key descriptor absent');
    const value: unknown = Reflect.get(row, key);
    if (key === ingredientInspectionSymbol) {
      if (!descriptor.enumerable || typeof value !== 'function')
        throw new Error('Unexpected Prisma Ingredient inspection property');
      continue;
    }
    Object.defineProperty(result, key, {
      value,
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable,
      writable: 'writable' in descriptor ? descriptor.writable : true,
    });
  }
  return result;
}
const snapshotInspectOptions = {
  customInspect: false,
  depth: null,
  maxArrayLength: null,
  maxStringLength: null,
  showHidden: true,
  colors: false,
  getters: false,
  compact: false,
  sorted: false,
} as const;
function snapshotText(value: unknown) {
  return inspect(value, snapshotInspectOptions);
}
type SnapshotPathSegment =
  | { kind: 'string'; key: string }
  | {
      kind: 'symbol';
      globalKey: string | null;
      description: string | null;
      identity: string;
    };
function snapshotDiagnostics(before: unknown, actual: unknown) {
  const symbolIds = new Map<symbol, string>();
  const segment = (key: string | symbol): SnapshotPathSegment => {
    if (typeof key === 'string') return { kind: 'string', key };
    let identity = symbolIds.get(key);
    if (!identity) {
      identity = `symbol-${symbolIds.size + 1}`;
      symbolIds.set(key, identity);
    }
    return {
      kind: 'symbol',
      globalKey: Symbol.keyFor(key) ?? null,
      description: key.description ?? null,
      identity,
    };
  };
  const metadata = (value: unknown) => {
    if (
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function')
    )
      return { type: typeof value, value: snapshotText(value) };
    return {
      type: typeof value,
      prototype: snapshotText(Object.getPrototypeOf(value)),
      keys: Reflect.ownKeys(value).map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return {
          key: segment(key),
          enumerable: descriptor?.enumerable,
          type:
            descriptor && 'value' in descriptor
              ? typeof descriptor.value
              : 'accessor',
        };
      }),
    };
  };
  const differences: {
    path: SnapshotPathSegment[];
    reason: string;
    beforePresent: boolean;
    actualPresent: boolean;
    before: string;
    actual: string;
  }[] = [];
  const add = (
    path: SnapshotPathSegment[],
    reason: string,
    left: unknown,
    right: unknown,
    beforePresent = true,
    actualPresent = true,
  ) =>
    differences.push({
      path,
      reason,
      beforePresent,
      actualPresent,
      before: snapshotText(left),
      actual: snapshotText(right),
    });
  const visited = new WeakMap<object, WeakSet<object>>();
  const walk = (left: unknown, right: unknown, path: SnapshotPathSegment[]) => {
    if (Object.is(left, right) || isDeepStrictEqual(left, right)) return;
    if (left instanceof Date || right instanceof Date) {
      add(path, 'date-epoch-or-type', left, right);
      return;
    }
    if (
      left === null ||
      right === null ||
      typeof left !== 'object' ||
      typeof right !== 'object'
    ) {
      add(path, 'type-value-or-function-identity', left, right);
      return;
    }
    const seen = visited.get(left) ?? new WeakSet<object>();
    if (seen.has(right)) return;
    seen.add(right);
    visited.set(left, seen);
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right))
      add(
        path,
        'prototype',
        Object.getPrototypeOf(left),
        Object.getPrototypeOf(right),
      );
    const keys = new Set([...Reflect.ownKeys(left), ...Reflect.ownKeys(right)]);
    for (const key of keys) {
      const next = [...path, segment(key)];
      const beforePresent = Object.hasOwn(left, key);
      const actualPresent = Object.hasOwn(right, key);
      const first = Object.getOwnPropertyDescriptor(left, key);
      const second = Object.getOwnPropertyDescriptor(right, key);
      if (!beforePresent || !actualPresent) {
        add(
          next,
          'own-key-presence',
          first && 'value' in first ? first.value : first,
          second && 'value' in second ? second.value : second,
          beforePresent,
          actualPresent,
        );
        continue;
      }
      if (first?.enumerable !== second?.enumerable)
        add(next, 'enumerability', first?.enumerable, second?.enumerable);
      if (!first || !second)
        throw new Error('Snapshot diagnostic descriptor absent');
      if (!('value' in first) || !('value' in second)) {
        if (first.get !== second.get || first.set !== second.set)
          add(next, 'accessor-identity', first, second);
        continue;
      }
      walk(first.value, second.value, next);
    }
  };
  walk(before, actual, []);
  return { before: metadata(before), actual: metadata(actual), differences };
}
async function assertIngredientSnapshotContract(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
) {
  const counts = {
    llm: f.calls.llm.length,
    renderer: f.calls.rendererSubmissions.length,
    uploads: f.calls.uploads.length,
  };
  const where = {
    id: actor.sourceAssetId,
    organizationId: actor.organizationId,
    brandId: actor.brandId,
    isDeleted: false,
  };
  const first = await f.prisma.ingredient.findFirstOrThrow({ where });
  const second = await f.prisma.ingredient.findFirstOrThrow({ where });
  const firstDescriptor = Object.getOwnPropertyDescriptor(
    first,
    ingredientInspectionSymbol,
  );
  const secondDescriptor = Object.getOwnPropertyDescriptor(
    second,
    ingredientInspectionSymbol,
  );
  const firstCallback: unknown = Reflect.get(first, ingredientInspectionSymbol);
  const secondCallback: unknown = Reflect.get(
    second,
    ingredientInspectionSymbol,
  );
  const observedPreflight = await readVisualRuntimePreflight(
    dirname(runtime(f).directory),
  );
  await writeFile(
    join(runtime(f).directory, 'ingredient-inspection-observation.json'),
    JSON.stringify(
      {
        gitHead: observedPreflight.metadata.gitHead,
        ingredientIds: [first.id, second.id],
        symbolGlobalKey: Symbol.keyFor(ingredientInspectionSymbol),
        callbacks: [firstDescriptor, secondDescriptor].map(
          (descriptor, index) => ({
            present: descriptor !== undefined,
            enumerable: descriptor?.enumerable,
            configurable: descriptor?.configurable,
            writable:
              descriptor && 'writable' in descriptor
                ? descriptor.writable
                : undefined,
            type: typeof (index === 0 ? firstCallback : secondCallback),
          }),
        ),
        differentReferences: firstCallback !== secondCallback,
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  expect(first.id).toBe(second.id);
  expect(firstDescriptor?.enumerable).toBe(true);
  expect(secondDescriptor?.enumerable).toBe(true);
  expect(typeof firstCallback).toBe('function');
  expect(typeof secondCallback).toBe('function');
  expect(firstCallback).not.toBe(secondCallback);
  expect(first).not.toStrictEqual(second);
  const materialized = ingredientSnapshot(first);
  expect(materialized).toStrictEqual(ingredientSnapshot(second));
  expect(Reflect.ownKeys(materialized)).toStrictEqual(
    Reflect.ownKeys(first).filter((key) => key !== ingredientInspectionSymbol),
  );
  for (const key of Reflect.ownKeys(materialized)) {
    expect(Object.getOwnPropertyDescriptor(materialized, key)?.enumerable).toBe(
      Object.getOwnPropertyDescriptor(first, key)?.enumerable,
    );
    const value: unknown = Reflect.get(materialized, key);
    const originalValue: unknown = Reflect.get(first, key);
    expect(value).toBe(originalValue);
    if (originalValue instanceof Date) {
      expect(value).toBeInstanceOf(Date);
      if (!(value instanceof Date))
        throw new Error('Materialized Date lost its type');
      expect(value.getTime()).toBe(originalValue.getTime());
    }
  }
  expect(materialized.updatedAt).toBeInstanceOf(Date);
  expect(typeof materialized.fileSize).toBe('number');
  const copy = () =>
    Object.defineProperties({}, Object.getOwnPropertyDescriptors(materialized));
  const controls: { name: string; preserved: true }[] = [];
  const unequal = (name: string, baseline: object, changed: object) => {
    expect(ingredientSnapshot(changed)).not.toStrictEqual(
      ingredientSnapshot(baseline),
    );
    controls.push({ name, preserved: true });
  };
  const shifted = copy();
  Object.defineProperty(shifted, 'updatedAt', {
    ...Object.getOwnPropertyDescriptor(materialized, 'updatedAt'),
    value: new Date(materialized.updatedAt.getTime() + 1),
  });
  unequal('updatedAt-plus-1ms', materialized, shifted);
  const resized = copy();
  Object.defineProperty(resized, 'fileSize', {
    ...Object.getOwnPropertyDescriptor(materialized, 'fileSize'),
    value: Number(materialized.fileSize) + 1,
  });
  unequal('fileSize', materialized, resized);
  const positive = copy();
  const negative = copy();
  Object.defineProperty(positive, 'fixtureZero', {
    value: +0,
    enumerable: true,
  });
  Object.defineProperty(negative, 'fixtureZero', {
    value: -0,
    enumerable: true,
  });
  unequal('signed-zero', positive, negative);
  const undefinedPresent = copy();
  Object.defineProperty(undefinedPresent, 'fixtureUndefined', {
    value: undefined,
    enumerable: true,
  });
  unequal('undefined-versus-missing', undefinedPresent, copy());
  const otherSymbol = Symbol('fixture-other-symbol');
  const symbolBefore = copy();
  const symbolAfter = copy();
  Object.defineProperty(symbolBefore, otherSymbol, {
    value: 1,
    enumerable: true,
  });
  Object.defineProperty(symbolAfter, otherSymbol, {
    value: 2,
    enumerable: true,
  });
  unequal('other-symbol-value', symbolBefore, symbolAfter);
  expect({
    llm: f.calls.llm.length,
    renderer: f.calls.rendererSubmissions.length,
    uploads: f.calls.uploads.length,
  }).toStrictEqual(counts);
  for (const queue of runtime(f).queues.values())
    expect(
      await queue.getJobCountByTypes(
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed',
      ),
    ).toBe(0);
  const preflight = await readVisualRuntimePreflight(
    dirname(runtime(f).directory),
  );
  await writeFile(
    join(runtime(f).directory, 'ingredient-snapshot-contract.json'),
    JSON.stringify(
      {
        gitHead: preflight.metadata.gitHead,
        ingredientId: first.id,
        symbol: {
          globalKey: Symbol.keyFor(ingredientInspectionSymbol),
          description: ingredientInspectionSymbol.description,
        },
        callbacks: {
          first: {
            enumerable: firstDescriptor?.enumerable,
            configurable: firstDescriptor?.configurable,
            writable:
              firstDescriptor && 'writable' in firstDescriptor
                ? firstDescriptor.writable
                : undefined,
            type: typeof firstCallback,
          },
          second: {
            enumerable: secondDescriptor?.enumerable,
            configurable: secondDescriptor?.configurable,
            writable:
              secondDescriptor && 'writable' in secondDescriptor
                ? secondDescriptor.writable
                : undefined,
            type: typeof secondCallback,
          },
          differentReferences: firstCallback !== secondCallback,
        },
        rawRowsStrictUnequal: true,
        materializedStrictEqual: true,
        ownKeys: snapshotDiagnostics(materialized, materialized).before,
        dates: Reflect.ownKeys(materialized).flatMap((key) => {
          const value: unknown = Reflect.get(materialized, key);
          return value instanceof Date
            ? [{ key: String(key), epoch: value.getTime() }]
            : [];
        }),
        controls,
        counts,
        queuesEmpty: true,
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
}
async function assertReplaySnapshot(
  f: VisualCodeAcceptanceFixture,
  before: Awaited<ReturnType<typeof snapshot>>,
  actual: Awaited<ReturnType<typeof snapshot>>,
  phase: string,
) {
  const directory = runtime(f).directory;
  await writeFile(
    join(directory, `${phase}-before.txt`),
    snapshotText(before),
    { flag: 'wx', mode: 0o600 },
  );
  await writeFile(
    join(directory, `${phase}-actual.txt`),
    snapshotText(actual),
    { flag: 'wx', mode: 0o600 },
  );
  const preflight = await readVisualRuntimePreflight(dirname(directory));
  const diagnostic = {
    gitHead: preflight.metadata.gitHead,
    phase,
    ...snapshotDiagnostics(before, actual),
  };
  const path = join(directory, `${phase}-differences.json`);
  await writeFile(path, JSON.stringify(diagnostic, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  try {
    expect(actual).toStrictEqual(before);
  } catch (error) {
    if (!diagnostic.differences.length)
      diagnostic.differences.push({
        path: [],
        reason: 'unclassified-strict-difference',
        beforePresent: true,
        actualPresent: true,
        before: snapshotText(before),
        actual: snapshotText(actual),
      });
    try {
      await writeFile(path, JSON.stringify(diagnostic, null, 2), {
        mode: 0o600,
      });
    } catch (diagnosticError) {
      if (error instanceof Error)
        Object.defineProperty(error, 'snapshotDiagnosticWriteError', {
          value: diagnosticError,
        });
      throw error;
    }
    throw error;
  }
}

async function snapshot(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
) {
  const scope = { organizationId: actor.organizationId, isDeleted: false };
  return {
    revisions: await revisions(f, actor),
    wallet: await f.credits.getWalletSnapshot(actor.organizationId),
    transactions: await f.prisma.creditTransaction.findMany({
      where: scope,
      orderBy: { id: 'asc' },
    }),
    ingredients: (
      await f.prisma.ingredient.findMany({
        where: scope,
        orderBy: { id: 'asc' },
      })
    ).map(ingredientSnapshot),
    calls: {
      llm: [...f.calls.llm],
      renderer: [...f.calls.rendererSubmissions],
      uploads: [...f.calls.uploads],
    },
  };
}
async function finish(
  f: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
  projectId: string,
) {
  const result = await run(f, actor, projectId);
  await media(f, actor, result.revision);
  await settlement(f, actor, result.revision);
  return result;
}
describe('visual-code cleanup rejection isolation (renderless)', () => {
  it.each([
    ['synchronous', 0],
    ['synchronous', 1],
    ['asynchronous', 0],
    ['asynchronous', 1],
  ] as const)(
    'continues after %s failure at step %i',
    async (mode, failedIndex) => {
      const calls: string[] = [];
      const cause = { original: mode, failedIndex };
      const stages = ['first', 'middle', 'last'];
      const steps: VisualCodeCleanupStep[] = stages.map((stage, index) => ({
        stage,
        run() {
          calls.push(stage);
          if (index === failedIndex) {
            if (mode === 'synchronous') throw cause;
            return Promise.reject(cause);
          }
        },
      }));
      const failure: unknown = await runVisualCodeCleanupSteps(steps).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(calls).toStrictEqual(stages);
      expect(failure).toBeInstanceOf(VisualCodeCleanupError);
      if (!(failure instanceof VisualCodeCleanupError))
        throw new Error('Cleanup failure aggregate absent');
      expect(failure.failures).toHaveLength(1);
      expect(failure.failures[0]?.stage).toBe(stages[failedIndex]);
      expect(failure.failures[0]?.cause).toBe(cause);
    },
  );
  it('collects resource and restoration failures while attempting every later step', async () => {
    const stages = [
      'queue.first.obliterate',
      'queue.first.close',
      'queue.second.obliterate',
      'queue.second.close',
      'module.close',
      'storage.upload.reset',
      'storage.download.reset',
      'globals.restore',
      'environment.restore',
    ];
    const failedStages = new Set([
      'queue.first.obliterate',
      'queue.first.close',
      'module.close',
      'storage.upload.reset',
    ]);
    const causes = new Map(
      [...failedStages].map((stage) => [stage, new Error(stage)]),
    );
    const calls: string[] = [];
    const ledger: Parameters<typeof runVisualCodeCleanupSteps>[1] = [];
    const failure: unknown = await runVisualCodeCleanupSteps(
      stages.map((stage) => ({
        stage,
        run() {
          calls.push(stage);
          if (failedStages.has(stage)) throw causes.get(stage);
        },
      })),
      ledger,
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(calls).toStrictEqual(stages);
    expect(failure).toBeInstanceOf(VisualCodeCleanupError);
    if (!(failure instanceof VisualCodeCleanupError))
      throw new Error('Cleanup failure aggregate absent');
    expect(failure.failures.map((error) => error.stage)).toStrictEqual([
      ...failedStages,
    ]);
    for (const error of failure.failures)
      expect(error.cause).toBe(causes.get(error.stage));
    expect(ledger).toStrictEqual(
      stages.map((stage) => ({
        stage,
        status: failedStages.has(stage) ? 'rejected' : 'fulfilled',
      })),
    );
  });
  it('fulfills after all successful steps', async () => {
    const calls: string[] = [];
    const ledger: Parameters<typeof runVisualCodeCleanupSteps>[1] = [];
    await expect(
      runVisualCodeCleanupSteps(
        ['first', 'last'].map((stage) => ({
          stage,
          run() {
            calls.push(stage);
          },
        })),
        ledger,
      ),
    ).resolves.toBeUndefined();
    expect(calls).toStrictEqual(['first', 'last']);
    expect(ledger).toStrictEqual([
      { stage: 'first', status: 'fulfilled' },
      { stage: 'last', status: 'fulfilled' },
    ]);
  });
});
const enabled = process.env.VISUAL_CODE_LOCAL_ACCEPTANCE === '1';
describe.skipIf(!enabled)(
  'visual-code local-runtime acceptance (explicit owned DB/Redis and Linux runsc prerequisites)',
  () => {
    beforeEach(() => {
      scenarioDeadline = Date.now() + 900000;
    });
    afterEach(async () => {
      const current = fixture;
      fixture = undefined;
      if (current?.runtime && current.runtime.outcome === 'incomplete')
        current.runtime.outcome = 'failed';
      await current?.close();
    }, 120000);
    it('hybrid exports and immutable revisions', async () => {
      const f = await setup('hybrid-success');
      const actor = await seedVisualCodeAcceptanceActor(f);
      const other = await seedVisualCodeAcceptanceActor(f);
      await assertIngredientSnapshotContract(f, actor);
      const baseline = await f.credits.getWalletSnapshot(actor.organizationId);
      const { parameters, projectId } = await create(f, actor);
      expect(
        (await f.credits.getWalletSnapshot(actor.organizationId)).held -
          baseline.held,
      ).toBeCloseTo(parameters.maximumCredits, 8);
      const first = await finish(f, actor, projectId);
      expect(outputSchema.parse(first.revision.outputs)).toHaveLength(3);
      for (const output of outputSchema.parse(first.revision.outputs))
        expect(await libraryIds(f, other)).not.toContain(output.ingredientId);
      const publicRevision = responseSchema.parse(
        await f.controller.get(f.request(actor.user), actor.user, projectId),
      ).data.attributes.revisions[0];
      expect(publicRevision?.hasSource).toBe(true);
      for (const key of [
        'sourceCode',
        'reservationId',
        'workflowExecutionId',
        'inputHash',
        'organizationId',
      ])
        expect(publicRevision).not.toHaveProperty(key);
      const before = await snapshot(f, actor);
      const original = await immutable(f, actor, first.revision);
      const replay = responseSchema.parse(
        await f.controller.create(
          f.request(actor.user),
          actor.user,
          parameters,
        ),
      );
      expect(replay.data.id).toBe(projectId);
      expect(replay.data.attributes.revisions[0]?.id).toBe(first.revision.id);
      await assertReplaySnapshot(
        f,
        before,
        await snapshot(f, actor),
        'unchanged-api-replay',
      );
      await expect(
        f.controller.create(f.request(actor.user), actor.user, {
          ...parameters,
          prompt: 'Changed replay input',
        }),
      ).rejects.toMatchObject({ status: 409 });
      await assertReplaySnapshot(
        f,
        before,
        await snapshot(f, actor),
        'rejected-conflicting-replay',
      );
      await runtime(f).redeliver(first.jobId);
      await assertReplaySnapshot(
        f,
        before,
        await snapshot(f, actor),
        'broker-redelivery',
      );
      expect(await immutable(f, actor, first.revision)).toEqual(original);
      const change = {
        requestId: `props-${randomUUID()}`,
        expectedRevision: 1,
        props: { title: 'Revised title' },
        maximumCredits: 1,
      };
      change.maximumCredits = await quote(
        f,
        actor,
        'revise',
        { ...change },
        projectId,
      );
      await f.controller.revise(
        f.request(actor.user),
        actor.user,
        projectId,
        change,
      );
      const second = await finish(f, actor, projectId);
      expect(await immutable(f, actor, first.revision)).toEqual(original);
      const authors = f.calls.llm.filter((kind) => kind === 'authoring').length;
      const exported = {
        requestId: `export-${randomUUID()}`,
        revision: 2,
        expectedRevision: 2,
        outputs: OUTPUTS.slice(1),
        maximumCredits: 1,
      };
      exported.maximumCredits = await quote(
        f,
        actor,
        'export',
        { ...exported },
        projectId,
      );
      await f.controller.export(
        f.request(actor.user),
        actor.user,
        projectId,
        exported,
      );
      const third = await finish(f, actor, projectId);
      expect(third.revision.sourceHash).toBe(second.revision.sourceHash);
      expect(f.calls.llm.filter((kind) => kind === 'authoring')).toHaveLength(
        authors,
      );
      const race = {
        requestId: `race-${randomUUID()}`,
        expectedRevision: 3,
        props: { title: 'Concurrent winner' },
        maximumCredits: 1,
      };
      race.maximumCredits = await quote(
        f,
        actor,
        'revise',
        { ...race },
        projectId,
      );
      const count = (await revisions(f, actor)).length;
      const reservations = await f.prisma.creditReservation.count({
        where: { organizationId: actor.organizationId, isDeleted: false },
      });
      const queue = runtime(f).queues.get(WORKFLOW_EXECUTION_QUEUE);
      const jobs = await queue?.getJobCountByTypes(
        'waiting',
        'active',
        'completed',
      );
      const raced = await Promise.allSettled([
        f.controller.revise(f.request(actor.user), actor.user, projectId, race),
        f.controller.revise(f.request(actor.user), actor.user, projectId, {
          ...race,
          requestId: `race-${randomUUID()}`,
        }),
      ]);
      expect(raced.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const refusal = raced.find((r) => r.status === 'rejected');
      if (refusal?.status !== 'rejected')
        throw new Error('Stale concurrency refusal absent');
      expect(refusal.reason).toBeInstanceOf(HttpException);
      expect(refusal.reason.getStatus()).toBe(409);
      expect((await revisions(f, actor)).length).toBe(count + 1);
      expect(
        await f.prisma.creditReservation.count({
          where: { organizationId: actor.organizationId, isDeleted: false },
        }),
      ).toBe(reservations + 1);
      expect(
        await queue?.getJobCountByTypes('waiting', 'active', 'completed'),
      ).toBe((jobs ?? 0) + 1);
      await finish(f, actor, projectId);
      expect(await immutable(f, actor, first.revision)).toEqual(original);
      expect(
        (await f.credits.getWalletSnapshot(actor.organizationId)).settled,
      ).toBeCloseTo(
        baseline.settled -
          (await revisions(f, actor)).reduce(
            (sum, r) => sum + r.consumedCredits,
            0,
          ),
        8,
      );
      runtime(f).assertions.push(
        'create-replay',
        'broker-redelivery',
        'immutable-revisions',
        'stale-concurrency',
      );
      runtime(f).outcome = 'passed';
    }, 900000);
    it('compile recovery preserves bounded receipts', async () => {
      const f = await setup('compile-recovery');
      const actor = await seedVisualCodeAcceptanceActor(f);
      const { projectId } = await create(f, actor);
      const result = await finish(f, actor, projectId);
      expect(f.calls.llm).toEqual(['authoring', 'authoring', 'inspection']);
      expect(
        receiptSchema
          .parse(result.revision.receipts)
          .filter((r) => r.kind === 'repair' && r.isResultApplied),
      ).toHaveLength(1);
      expect(runtime(f).receipts.some((r) => r.status === 'failed')).toBe(true);
      expect(f.calls.rendererSubmissions).toHaveLength(3);
      runtime(f).assertions.push('real-compile-failure', 'one-applied-repair');
      runtime(f).outcome = 'passed';
    }, 900000);
    it('visual rejection stops after two repairs', async () => {
      const f = await setup('visual-rejection');
      const actor = await seedVisualCodeAcceptanceActor(f);
      const { projectId } = await create(f, actor);
      const result = await run(f, actor, projectId);
      expect(result.revision.status).toBe(VisualCodeStatus.FAILED);
      expect(result.revision.outputs).toEqual([]);
      expect(result.revision.sourceCode).toBeTruthy();
      expect(result.revision.diagnostics).toBeTruthy();
      expect(f.calls.llm).toEqual([
        'authoring',
        'inspection',
        'authoring',
        'inspection',
        'authoring',
        'inspection',
      ]);
      const receipts = receiptSchema.parse(result.revision.receipts);
      expect(
        receipts.filter((r) => r.kind === 'repair' && r.isResultApplied),
      ).toHaveLength(2);
      expect(receipts.filter((r) => r.kind === 'inspection')).toHaveLength(3);
      expect(f.calls.rendererSubmissions).toHaveLength(3);
      expect(
        await f.prisma.ingredient.count({
          where: {
            organizationId: actor.organizationId,
            isDeleted: false,
            generationSource: { startsWith: 'visual-code:' },
          },
        }),
      ).toBe(0);
      await settlement(f, actor, result.revision);
      runtime(f).assertions.push('two-repair-limit', 'no-output-admission');
      runtime(f).outcome = 'passed';
    }, 900000);
    it('budget and asset scope refuse work', async () => {
      const f = await setup('hybrid-success');
      const actor = await seedVisualCodeAcceptanceActor(f);
      const other = await seedVisualCodeAcceptanceActor(f);
      const quoteInput = input(actor);
      const parameters: CreateVisualProjectDto = {
        ...quoteInput,
        maximumCredits: await quote(f, actor, 'create', { ...quoteInput }),
      };
      f.resetExternalCalls();
      const before = await snapshot(f, actor);
      await expect(
        f.controller.create(f.request(actor.user), actor.user, {
          ...parameters,
          maximumCredits: parameters.maximumCredits - 0.01,
        }),
      ).rejects.toThrow();
      expect(await snapshot(f, actor)).toStrictEqual(before);
      const brandId = generateIdString();
      await f.prisma.brand.create({
        data: createTestBrand({
          id: brandId,
          organizationId: actor.organizationId,
          userId: actor.userId,
          slug: `visual-${brandId}`,
        }),
      });
      f.seeds.brandIds.push(brandId);
      const source = await f.prisma.ingredient.findFirstOrThrow({
        where: {
          id: actor.sourceAssetId,
          organizationId: actor.organizationId,
          isDeleted: false,
        },
      });
      const copied = await f.prisma.ingredient.create({
        data: {
          id: generateIdString(),
          organizationId: actor.organizationId,
          brandId,
          userId: actor.userId,
          metadataId: source.metadataId,
          category: IngredientCategory.IMAGE,
          status: IngredientStatus.GENERATED,
          s3Key: source.s3Key,
          mimeType: source.mimeType,
          fileSize: source.fileSize,
        },
      });
      for (const asset of [other.sourceAssetId, copied.id])
        for (const operation of ['quote', 'create'] as const) {
          const scoped = {
            ...parameters,
            requestId: `scope-${randomUUID()}`,
            sourceAssetIds: [asset],
          };
          await expect(
            operation === 'quote'
              ? quote(f, actor, 'create', { ...scoped })
              : f.controller.create(f.request(actor.user), actor.user, scoped),
          ).rejects.toThrow('visual_source_asset_unavailable');
        }
      expect(f.calls.llm).toEqual([]);
      expect(f.calls.rendererSubmissions).toEqual([]);
      expect(f.calls.uploads).toEqual([]);
      expect(
        await runtime(f)
          .queues.get(WORKFLOW_EXECUTION_QUEUE)
          ?.getJobCountByTypes('waiting', 'active', 'completed', 'failed'),
      ).toBe(0);
      expect(
        (await f.credits.getWalletSnapshot(actor.organizationId)).held,
      ).toBe(0);
      runtime(f).assertions.push(
        'quote-minus-cent-denied',
        'tenant-and-brand-denied',
      );
      runtime(f).outcome = 'passed';
    }, 900000);
    it('cancelled rendering settles once', async () => {
      const f = await setup('hybrid-success');
      const actor = await seedVisualCodeAcceptanceActor(f);
      const { projectId } = await create(f, actor);
      const pending = await queued(f, actor, projectId);
      await runtime(f).startWorker();
      const deadline = Date.now() + 120000;
      let running = false;
      while (Date.now() < deadline) {
        if (runtime(f).receipts.some((r) => r.status === 'running')) {
          running = true;
          break;
        }
        if (
          runtime(f).receipts.some((r) =>
            ['completed', 'failed', 'cancelled'].includes(r.status),
          )
        )
          throw new Error(
            'Cancellation timing precondition failed: renderer already terminal',
          );
        if (runtime(f).workerErrors.length)
          throw new Error(runtime(f).workerErrors.join('\n'));
        await new Promise((accept) => setTimeout(accept, 25));
      }
      if (!running)
        throw new Error(
          'Cancellation timing precondition failed: no actual running receipt',
        );
      await f.controller.cancel(f.request(actor.user), actor.user, projectId, {
        revision: 1,
      });
      await runtime(f).waitForJob(pending.job.id ?? '');
      const revision = (await revisions(f, actor, projectId))[0];
      if (!revision) throw new Error('Cancelled revision absent');
      expect(revision.status).toBe(VisualCodeStatus.CANCELLED);
      expect(revision.outputs).toEqual([]);
      await settlement(f, actor, revision);
      const terminalDeadline = Math.min(Date.now() + 120000, scenarioDeadline);
      let cancelled = false;
      while (Date.now() < terminalDeadline) {
        const remainingMs = terminalDeadline - Date.now();
        if (remainingMs <= 0) break;
        const signal = AbortSignal.timeout(remainingMs);
        const id = f.calls.rendererSubmissions[0];
        if (!id) throw new Error('Submitted renderer ID absent');
        const response = await fetch(
          new URL(
            `/jobs/${encodeURIComponent(id)}`,
            required('VISUAL_CODE_LOCAL_RENDERER_URL'),
          ),
          {
            headers: {
              authorization: `Bearer ${required('VISUAL_CODE_LOCAL_RENDERER_TOKEN')}`,
            },
            redirect: 'error',
            signal,
          },
        );
        if (!response.ok)
          throw new Error(`Renderer HTTP status ${response.status}`);
        const receipt = z
          .object({ status: z.string() })
          .parse(await response.json());
        if (receipt.status === 'cancelled') {
          cancelled = true;
          break;
        }
        if (['completed', 'failed'].includes(receipt.status))
          throw new Error('Renderer did not cancel actual running job');
        const delayMs = Math.max(
          0,
          Math.min(100, terminalDeadline - Date.now()),
        );
        if (delayMs > 0)
          await new Promise((accept) => setTimeout(accept, delayMs));
      }
      expect(cancelled).toBe(true);
      const before = await snapshot(f, actor);
      await runtime(f).redeliver(pending.job.id ?? '');
      expect(await snapshot(f, actor)).toStrictEqual(before);
      runtime(f).assertions.push(
        'running-render-cancellation',
        'once-only-settlement',
      );
      runtime(f).outcome = 'passed';
    }, 900000);
  },
);
