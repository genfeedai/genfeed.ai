import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  LearningCellDescriptor,
  LearningCollectionReceiptV1,
  LearningMetrics,
  LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  checkpointValidity,
  type LearningMeasurement,
  learningCapability,
  learningDescriptorTuple,
  learningRegisteredProfiles,
  median,
  validLearningDescriptor,
  weightedMeasurement,
} from '@genfeedai/harness';
import {
  type ContentLearningCheckpoint,
  type Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

interface LearningCheckpointProfile {
  profileId: string;
  descriptor: LearningCellDescriptor;
  measurement: LearningMeasurement | null;
}
export function learningCheckpointProfiles(
  platform: string,
  format: string,
  metrics: LearningMetrics,
): LearningCheckpointProfile[] {
  const objectives = [
    'awareness',
    'engagement',
    'authority-proxy',
    'conversion-click',
    'retention-watch',
  ] as const;
  return objectives.flatMap((objective) =>
    learningRegisteredProfiles(platform, format, objective).map(
      ({ descriptor, capability }) => {
        const required = [
          descriptor.exposureSource,
          ...descriptor.metricWeights.map(([metric]) => metric),
        ];
        const available = required.every(
          (metric) =>
            metrics.metrics[metric]?.availability === 'observed' &&
            typeof metrics.metrics[metric]?.value === 'number' &&
            Number.isFinite(metrics.metrics[metric]?.value) &&
            Number(metrics.metrics[metric]?.value) >= 0,
        );
        const values = Object.fromEntries(
          Object.entries(metrics.metrics).flatMap(([name, metric]) =>
            metric?.availability === 'observed' &&
            typeof metric.value === 'number' &&
            Number.isFinite(metric.value) &&
            metric.value >= 0
              ? [[name, metric.value]]
              : [],
          ),
        );
        return {
          profileId: learningHash(learningDescriptorTuple(descriptor)),
          descriptor,
          measurement: available
            ? weightedMeasurement(
                values[descriptor.exposureSource],
                values,
                capability,
              )
            : null,
        };
      },
    ),
  );
}
export function parseLearningMeasurement(
  value: unknown,
): LearningMeasurement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const exposure = 'exposure' in value ? value.exposure : undefined,
    weightedActions =
      'weightedActions' in value ? value.weightedActions : undefined;
  if (
    typeof exposure !== 'number' ||
    typeof weightedActions !== 'number' ||
    !Number.isFinite(exposure) ||
    !Number.isFinite(weightedActions) ||
    exposure < 0 ||
    weightedActions < 0
  )
    return null;
  const watch =
    'averageWatchTimeSeconds' in value
      ? value.averageWatchTimeSeconds
      : undefined;
  if (
    watch !== undefined &&
    (typeof watch !== 'number' || !Number.isFinite(watch) || watch < 0)
  )
    return null;
  return {
    exposure,
    weightedActions,
    ...(typeof watch === 'number' ? { averageWatchTimeSeconds: watch } : {}),
  };
}
export function learningCheckpointCollection(
  row: ContentLearningCheckpoint,
): LearningCollectionReceiptV1 | null {
  if (
    !row.sourceAttemptId ||
    [
      row.publishedAt,
      row.requestStartedAt,
      row.receivedAt,
      ...(row.providerAsOf ? [row.providerAsOf] : []),
    ].some((date) => !Number.isFinite(date.getTime()))
  )
    return null;
  const raw = row.measurement;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const collection = raw.collection;
  if (
    collection &&
    typeof collection === 'object' &&
    !Array.isArray(collection) &&
    collection.version === 1 &&
    ['observed', 'retryable_failure', 'terminal_unavailable'].includes(
      String(collection.outcome),
    ) &&
    (collection.reasonCode === null ||
      typeof collection.reasonCode === 'string')
  ) {
    const receipt = collection as unknown as LearningCollectionReceiptV1;
    if (receipt.outcome === 'observed' && checkpointValidity(row) !== null)
      return null;
    return receipt;
  }
  if (collection !== undefined) return null;
  if (
    ![
      'valid',
      'unknown_organic',
      'ineligible_paid_or_pinned',
      'unsupported_metric',
      'superseded',
    ].includes(row.validity) ||
    checkpointValidity(row) !== null
  )
    return null;
  const metrics = raw.metricAvailability;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics))
    return null;
  const observed = Object.values(metrics).some(
    (metric) =>
      metric &&
      typeof metric === 'object' &&
      !Array.isArray(metric) &&
      metric.availability === 'observed' &&
      typeof metric.value === 'number' &&
      Number.isFinite(metric.value) &&
      metric.value >= 0,
  );
  return observed
    ? { version: 1, outcome: 'observed', reasonCode: null }
    : null;
}
@Injectable()
export class LearningCheckpointService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: LearningAccountService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  async fulfilledWindow(
    organizationId: string,
    postId: string,
    credentialId: string,
    publishedAt: Date,
    windowId = '48h-v1',
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const receipts = await tx.contentLearningCheckpoint.findMany({
      where: {
        organizationId,
        postId,
        credentialId,
        publishedAt,
        windowId,
        isDeleted: false,
      },
      orderBy: [{ revision: 'asc' }, { id: 'asc' }],
    });
    return (
      receipts.find((receipt) => {
        const collection = learningCheckpointCollection(receipt);
        return collection && collection.outcome !== 'retryable_failure';
      }) ?? null
    );
  }
  async latestAttempt(
    organizationId: string,
    postId: string,
    credentialId: string,
    publishedAt: Date,
    windowId = '48h-v1',
  ) {
    return this.prisma.contentLearningCheckpoint.findFirst({
      where: {
        organizationId,
        postId,
        credentialId,
        publishedAt,
        windowId,
        isDeleted: false,
      },
      orderBy: [{ revision: 'desc' }, { id: 'desc' }],
    });
  }
  async capture(input: {
    organizationId: string;
    postId: string;
    credentialId: string;
    format: string;
    objective: LearningScope['objective'];
    publishedAt: Date;
    requestStartedAt: Date;
    receivedAt: Date;
    sourceAttemptId: string;
    learningMetrics: LearningMetrics;
    windowId?: string;
    supersedesId?: string;
  }) {
    const credential = await this.accounts.credential(
      input.organizationId,
      input.credentialId,
    );
    const account = await this.accounts.ensure(
      input.organizationId,
      input.credentialId,
    );
    if (account.mode === 'disabled') return null;
    const post = await this.prisma.post.findFirst({
      where: {
        id: input.postId,
        organizationId: input.organizationId,
        brandId: credential.brandId,
        credentialId: input.credentialId,
        isDeleted: false,
      },
    });
    if (
      !post?.publishedAt ||
      post.publishedAt.getTime() !== input.publishedAt.getTime()
    )
      throw new BadRequestException('Post/account provenance conflict');
    const observed = Object.entries(input.learningMetrics.metrics)
      .filter(
        ([, metric]) =>
          metric?.availability === 'observed' &&
          typeof metric.value === 'number' &&
          Number.isFinite(metric.value),
      )
      .map(([name]) => name);
    const platform = credential.platform.toLowerCase();
    const capability = learningCapability(
      platform,
      input.format,
      input.objective,
      observed,
    );
    const values = Object.fromEntries(
      Object.entries(input.learningMetrics.metrics).map(([name, metric]) => [
        name,
        metric?.value ?? 0,
      ]),
    );
    const measurement = capability
      ? weightedMeasurement(
          values[capability.exposureSource],
          values,
          capability,
        )
      : null;
    const providerAsOf = input.learningMetrics.providerAsOf
      ? new Date(input.learningMetrics.providerAsOf)
      : null;
    if (
      input.requestStartedAt.getTime() <
      input.publishedAt.getTime() + 48 * 3600000
    )
      return null;
    const invalid = checkpointValidity({ ...input, providerAsOf });
    const collection: LearningCollectionReceiptV1 =
      input.receivedAt.getTime() > input.publishedAt.getTime() + 49 * 3600000
        ? {
            version: 1,
            outcome: 'terminal_unavailable',
            reasonCode: 'missed_window',
          }
        : invalid
          ? { version: 1, outcome: 'retryable_failure', reasonCode: invalid }
          : (input.learningMetrics.collection ?? {
              version: 1,
              outcome: 'retryable_failure',
              reasonCode: 'collection_receipt_missing',
            });
    const validity =
      (collection.outcome !== 'observed'
        ? (collection.reasonCode ?? 'collection_failed')
        : null) ??
      invalid ??
      (!capability
        ? 'unsupported_metric'
        : input.learningMetrics.isPaid === true ||
            input.learningMetrics.isPinned === true
          ? 'ineligible_paid_or_pinned'
          : input.learningMetrics.isPaid !== false ||
              input.learningMetrics.isPinned !== false
            ? 'unknown_organic'
            : 'valid');
    const fingerprint = learningHash([
      input.postId,
      input.credentialId,
      input.windowId ?? '48h-v1',
      input.requestStartedAt.toISOString(),
      input.learningMetrics,
    ]);
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, input.supersedesId ? 'exclusive' : 'shared');
      const locked = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM posts WHERE id = ${input.postId} AND "organizationId" = ${input.organizationId} AND "isDeleted" = false FOR UPDATE`;
      if (locked.length !== 1) return null;
      const currentPost = await tx.post.findFirst({
        where: {
          id: input.postId,
          organizationId: input.organizationId,
          brandId: credential.brandId,
          credentialId: input.credentialId,
          publishedAt: input.publishedAt,
          isDeleted: false,
        },
      });
      const currentAccount = await tx.contentLearningAccount.findFirst({
        where: {
          id: account.id,
          organizationId: input.organizationId,
          brandId: credential.brandId,
          credentialId: input.credentialId,
          isDeleted: false,
        },
      });
      const currentCredential = await tx.credential.findFirst({
        where: {
          id: input.credentialId,
          organizationId: input.organizationId,
          brandId: credential.brandId,
          isDeleted: false,
        },
      });
      if (
        !currentPost ||
        !currentAccount ||
        currentAccount.mode === 'disabled' ||
        !currentCredential
      )
        return null;
      if (!input.supersedesId) {
        const fulfilled = await this.fulfilledWindow(
          input.organizationId,
          input.postId,
          input.credentialId,
          input.publishedAt,
          input.windowId ?? '48h-v1',
          tx,
        );
        if (fulfilled) return fulfilled;
      }
      const existing = await tx.contentLearningCheckpoint.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceFingerprint: fingerprint,
          isDeleted: false,
        },
      });
      if (existing) return existing;
      const original = input.supersedesId
        ? await tx.contentLearningCheckpoint.findFirst({
            where: {
              id: input.supersedesId,
              organizationId: input.organizationId,
              postId: input.postId,
              credentialId: input.credentialId,
              isDeleted: false,
            },
          })
        : null;
      if (
        input.supersedesId &&
        (!original ||
          original.windowId !== (input.windowId ?? '48h-v1') ||
          original.requestStartedAt.getTime() !==
            input.requestStartedAt.getTime())
      )
        throw new BadRequestException(
          'Correction must identify the same observation window',
        );
      const latest = await tx.contentLearningCheckpoint.findFirst({
        where: {
          organizationId: input.organizationId,
          postId: input.postId,
          credentialId: input.credentialId,
          windowId: input.windowId ?? '48h-v1',
          isDeleted: false,
        },
        orderBy: { revision: 'desc' },
      });
      const checkpoint = await tx.contentLearningCheckpoint.create({
        data: {
          organizationId: input.organizationId,
          brandId: credential.brandId,
          credentialId: input.credentialId,
          postId: input.postId,
          windowId: input.windowId ?? '48h-v1',
          revision: (latest?.revision ?? -1) + 1,
          sourceAttemptId: input.sourceAttemptId,
          dueAt: new Date(input.publishedAt.getTime() + 48 * 3600000),
          requestStartedAt: input.requestStartedAt,
          receivedAt: input.receivedAt,
          providerAsOf,
          measurement: toPrismaJson({
            collection,
            measurement: collection.outcome === 'observed' ? measurement : null,
            metricAvailability: input.learningMetrics.metrics,
            profiles:
              collection.outcome === 'observed'
                ? learningCheckpointProfiles(
                    platform,
                    input.format,
                    input.learningMetrics,
                  )
                : [],
            profile: input.objective,
            mask: capability?.mask,
            timeBasis: providerAsOf ? 'provider_as_of' : 'collection_time',
          }),
          format: input.format,
          publishedAt: input.publishedAt,
          organicProvenance: toPrismaJson({
            isPaid: input.learningMetrics.isPaid,
            isPinned: input.learningMetrics.isPinned,
            source: 'provider',
          }),
          sourceFingerprint: fingerprint,
          supersedesId: original?.id,
          validity,
        },
      });
      if (original) {
        await tx.contentLearningCheckpoint.updateMany({
          where: {
            id: original.id,
            organizationId: input.organizationId,
            isDeleted: false,
          },
          data: { validity: 'superseded' },
        });
        await this.dependencies.invalidate('checkpoint', original.id, tx);
      }
      await tx.contentLearningAccount.updateMany({
        where: {
          id: account.id,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: { evidenceRevision: { increment: 1 } },
      });
      return checkpoint;
    });
  }
  async freeze(
    scope: LearningScope,
    cutoff: Date,
    descriptor: LearningCellDescriptor,
    tx?: Prisma.TransactionClient,
  ) {
    if (!validLearningDescriptor(descriptor))
      throw new BadRequestException(
        'Immutable registered cell descriptor required',
      );
    const descriptorHash = learningHash(learningDescriptorTuple(descriptor));
    if (
      !validLearningDescriptor(descriptor) ||
      descriptorHash !== scope.rewardProfileId ||
      descriptor.platform !== scope.platform ||
      descriptor.format !== scope.format ||
      descriptor.objective !== scope.objective ||
      !Number.isFinite(cutoff.getTime())
    )
      throw new BadRequestException(
        'Immutable registered cell descriptor required',
      );
    const collect = async (client: Prisma.TransactionClient) => {
      const selected: ContentLearningCheckpoint[] = [],
        samples: LearningMeasurement[] = [],
        distinct = new Set<string>();
      let cursor: { receivedAt: Date; id: string } | undefined;
      while (selected.length < 50) {
        const rows = await client.contentLearningCheckpoint.findMany({
          where: {
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            credentialId: scope.credentialId,
            format: scope.format,
            validity: 'valid',
            windowId: '48h-v1',
            isDeleted: false,
            receivedAt: {
              lte: cutoff,
              gte: new Date(cutoff.getTime() - 90 * 86400000),
            },
            ...(cursor
              ? {
                  OR: [
                    { receivedAt: { lt: cursor.receivedAt } },
                    { receivedAt: cursor.receivedAt, id: { gt: cursor.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
          take: 100,
        });
        for (const row of rows) {
          if (distinct.has(row.postId)) continue;
          const raw = row.measurement;
          if (
            !raw ||
            typeof raw !== 'object' ||
            Array.isArray(raw) ||
            !Array.isArray(raw.profiles)
          )
            continue;
          const profile = raw.profiles.find(
            (value) =>
              value &&
              typeof value === 'object' &&
              !Array.isArray(value) &&
              value.profileId === descriptorHash &&
              validLearningDescriptor(value.descriptor) &&
              learningHash(learningDescriptorTuple(value.descriptor)) ===
                descriptorHash,
          );
          if (!profile || typeof profile !== 'object' || Array.isArray(profile))
            continue;
          const measurement = parseLearningMeasurement(profile.measurement);
          if (
            !measurement ||
            (descriptor.retention &&
              measurement.averageWatchTimeSeconds === undefined) ||
            !(await this.dependencies.valid(
              'checkpoint',
              row.id,
              client,
              scope.organizationId,
            ))
          )
            continue;
          selected.push(row);
          samples.push(measurement);
          distinct.add(row.postId);
          if (selected.length === 50) break;
        }
        if (rows.length < 100) break;
        const last = rows[rows.length - 1];
        cursor = { receivedAt: last.receivedAt, id: last.id };
      }
      // Revalidate the exact contributing versions before any immutable baseline write.
      for (const row of selected) {
        const current = await client.contentLearningCheckpoint.findFirst({
          where: {
            id: row.id,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            credentialId: scope.credentialId,
            revision: row.revision,
            validity: 'valid',
            isDeleted: false,
          },
        });
        if (
          !current ||
          !(await this.dependencies.valid(
            'checkpoint',
            row.id,
            client,
            scope.organizationId,
          ))
        )
          throw new ConflictException('Baseline contributor changed');
      }
      const fingerprint = learningHash([
        learningScopeKey(scope),
        descriptorHash,
        cutoff.toISOString(),
        selected.map((row) => [row.id, row.revision]),
      ]);
      // tenant-scope-ignore: unique immutable fingerprint upsert
      const baseline = await client.contentLearningBaseline.upsert({
        where: { fingerprint },
        create: {
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          credentialId: scope.credentialId,
          fingerprint,
          scopeKey: learningScopeKey(scope),
          cellDescriptor: toPrismaJson(descriptor),
          descriptorHash,
          cutoff,
          configVersion: descriptor.configVersion,
          contributorCheckpointIds: selected.map((row) => row.id),
          contributorRevisions: selected.map((row) => row.revision),
          count: samples.length,
          medianExposure: median(samples.map((row) => row.exposure)),
          samples: toPrismaJson(samples),
          validity: samples.length >= 20 ? 'valid' : 'insufficient_baseline',
        },
        update: {},
      });
      for (const row of selected)
        await this.dependencies.link(
          client,
          await this.dependencies.resolve(
            'checkpoint',
            row.id,
            scope.organizationId,
            client,
          ),
          await this.dependencies.resolve(
            'baseline',
            baseline.id,
            scope.organizationId,
            client,
          ),
        );
      return baseline;
    };
    if (tx) return collect(tx);
    return this.prisma.$transaction(async (client) => {
      await learningFence(client, 'shared');
      return collect(client);
    });
  }
}
