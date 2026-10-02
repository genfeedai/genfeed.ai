import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type {
  LearningCellDescriptor,
  LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  type LearningMeasurement,
  learningDescriptorTuple,
  validLearningDescriptor,
} from '@genfeedai/harness';
import type { ContentLearningCheckpoint, Prisma } from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';
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
export async function selectLearningBaseline(
  client: Prisma.TransactionClient,
  scope: LearningScope,
  cutoff: Date,
  descriptor: LearningCellDescriptor,
  dependencies: Pick<LearningDependencyService, 'valid'>,
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
  const selected: ContentLearningCheckpoint[] = [],
    samples: LearningMeasurement[] = [],
    distinct = new Set<string>();
  let cursor: { receivedAt: Date; id: string } | undefined;
  while (selected.length < 50) {
    const rows = await client.contentLearningCheckpoint.findMany({
      where: scopedWhere(scope.organizationId, {
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
      }),
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
        !(await dependencies.valid(
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
      !(await dependencies.valid(
        'checkpoint',
        row.id,
        client,
        scope.organizationId,
      ))
    )
      throw new ConflictException('Baseline contributor changed');
  }
  return { selected, samples };
}
