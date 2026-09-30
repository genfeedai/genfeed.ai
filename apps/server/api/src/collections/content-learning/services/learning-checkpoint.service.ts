import { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LearningMetrics, LearningScope } from '@genfeedai/contracts';
import {
  checkpointValidity,
  type LearningMeasurement,
  learningCapability,
  median,
  weightedMeasurement,
} from '@genfeedai/harness';
import { toPrismaJson } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';
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
    !Number.isFinite(weightedActions)
  )
    return null;
  const watch =
    'averageWatchTimeSeconds' in value
      ? value.averageWatchTimeSeconds
      : undefined;
  return {
    exposure,
    weightedActions,
    ...(typeof watch === 'number' ? { averageWatchTimeSeconds: watch } : {}),
  };
}
@Injectable()
export class LearningCheckpointService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: LearningAccountService,
    private readonly dependencies: LearningDependencyService,
  ) {}
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
    if (!post)
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
      ? weightedMeasurement(values.exposure, values, capability)
      : null;
    const providerAsOf = input.learningMetrics.providerAsOf
      ? new Date(input.learningMetrics.providerAsOf)
      : null;
    const invalid = checkpointValidity({ ...input, providerAsOf });
    const validity =
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
            measurement,
            metricAvailability: input.learningMetrics.metrics,
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
  async freeze(scope: LearningScope, cutoff: Date) {
    const rows = await this.prisma.contentLearningCheckpoint.findMany({
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
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
      take: 500,
    });
    const distinct = new Set<string>();
    const selected = rows
      .filter((row) => {
        if (distinct.has(row.postId)) return false;
        const data = row.measurement;
        if (
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          !('profile' in data) ||
          data.profile !== scope.objective
        )
          return false;
        distinct.add(row.postId);
        return true;
      })
      .slice(0, 50);
    const samples = selected.flatMap((row) => {
      const value = row.measurement;
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return [];
      const measurement = parseLearningMeasurement(
        'measurement' in value ? value.measurement : null,
      );
      return measurement ? [measurement] : [];
    });
    const fingerprint = learningHash([
      learningScopeKey(scope),
      cutoff.toISOString(),
      selected.map((row) => [row.id, row.revision]),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const baseline = await tx.contentLearningBaseline.upsert({
        where: { fingerprint },
        create: {
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          credentialId: scope.credentialId,
          fingerprint,
          scopeKey: learningScopeKey(scope),
          cutoff,
          configVersion: 'rl-reward-v1-experimental',
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
          tx,
          'checkpoint',
          row.id,
          String(row.revision),
          'baseline',
          baseline.id,
        );
      return baseline;
    });
  }
}
