import {
  learningHash,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import type {
  LearningCellDescriptor,
  LearningScope,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  type LearningMeasurement,
  learningDescriptorTuple,
  median,
  validLearningDescriptor,
} from '@genfeedai/harness';
import type { ContentLearningCheckpoint } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

export type LearningBaselineMaterializationContributor = Pick<
  ContentLearningCheckpoint,
  'id' | 'postId' | 'revision' | 'receivedAt'
>;
export interface LearningBaselineMaterializationInput {
  scope: LearningScope;
  descriptor: LearningCellDescriptor;
  epoch: number;
  evidenceRevision: number;
  cutoff: Date;
  contributors: readonly LearningBaselineMaterializationContributor[];
  samples: readonly LearningMeasurement[];
}
export interface LearningBaselineMaterializationProjection {
  scopeKey: string;
  descriptorHash: string;
  fingerprint: string;
  epoch: number;
  evidenceRevision: number;
  cutoff: Date;
  expiresAt: Date | null;
  contributorCheckpointIds: string[];
  contributorRevisions: number[];
  samples: LearningMeasurement[];
  count: number;
  medianExposure: number;
}
const MAX_AGE_MS = 90 * 86400000;
function invalid(): never {
  throw new BadRequestException('Invalid baseline materialization input');
}
function validIdentity(value: string): boolean {
  return (
    typeof value === 'string' && value.length > 0 && value.trim() === value
  );
}
function validCounter(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 2147483647;
}
function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}
function validMetric(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function descriptorTuple(
  descriptor: LearningCellDescriptor,
): readonly unknown[] {
  try {
    if (!validLearningDescriptor(descriptor)) invalid();
    return learningDescriptorTuple(descriptor);
  } catch {
    return invalid();
  }
}
function validateRows(input: LearningBaselineMaterializationInput): void {
  if (
    input.contributors.length !== input.samples.length ||
    input.contributors.length > 50
  )
    invalid();
  const ids = new Set<string>();
  const posts = new Set<string>();
  const cutoff = input.cutoff.getTime();
  input.contributors.forEach((row, index) => {
    const sample = input.samples[index];
    if (
      !validIdentity(row.id) ||
      !validIdentity(row.postId) ||
      !validCounter(row.revision) ||
      !validDate(row.receivedAt) ||
      row.receivedAt.getTime() < cutoff - MAX_AGE_MS ||
      row.receivedAt.getTime() > cutoff ||
      ids.has(row.id) ||
      posts.has(row.postId) ||
      !validMetric(sample.exposure) ||
      !validMetric(sample.weightedActions) ||
      (sample.averageWatchTimeSeconds !== undefined &&
        !validMetric(sample.averageWatchTimeSeconds)) ||
      (input.descriptor.retention &&
        sample.averageWatchTimeSeconds === undefined)
    )
      invalid();
    ids.add(row.id);
    posts.add(row.postId);
  });
}
export function buildLearningBaselineMaterialization(
  input: LearningBaselineMaterializationInput,
): LearningBaselineMaterializationProjection {
  const tuple = descriptorTuple(input.descriptor);
  if (
    !validIdentity(input.scope.organizationId) ||
    !validIdentity(input.scope.brandId) ||
    !validIdentity(input.scope.credentialId) ||
    !validCounter(input.epoch) ||
    !validCounter(input.evidenceRevision) ||
    !validDate(input.cutoff)
  )
    invalid();
  const descriptorHash = learningHash(tuple);
  if (
    input.scope.rewardProfileId !== descriptorHash ||
    input.scope.platform !== input.descriptor.platform ||
    input.scope.format !== input.descriptor.format ||
    input.scope.objective !== input.descriptor.objective
  )
    invalid();
  validateRows(input);
  const expiresAt = input.contributors.length
    ? new Date(
        Math.min(...input.contributors.map((row) => row.receivedAt.getTime())) +
          MAX_AGE_MS,
      )
    : null;
  if (expiresAt && !validDate(expiresAt)) invalid();
  const medianExposure = median(input.samples.map((row) => row.exposure));
  if (!Number.isFinite(medianExposure)) invalid();
  const scopeKey = learningScopeKey(input.scope);
  const fingerprint = learningHash([
    'baseline-materialization-v1',
    scopeKey,
    descriptorHash,
    input.epoch,
    input.evidenceRevision,
    input.cutoff.toISOString(),
    input.contributors.map((row, index) => [
      row.id,
      row.revision,
      row.receivedAt.toISOString(),
      input.samples[index].exposure,
      input.samples[index].weightedActions,
      input.samples[index].averageWatchTimeSeconds ?? null,
    ]),
  ]);
  return {
    scopeKey,
    descriptorHash,
    fingerprint,
    epoch: input.epoch,
    evidenceRevision: input.evidenceRevision,
    cutoff: new Date(input.cutoff.getTime()),
    expiresAt,
    contributorCheckpointIds: input.contributors.map((row) => row.id),
    contributorRevisions: input.contributors.map((row) => row.revision),
    samples: input.samples.map((row) => ({
      exposure: row.exposure,
      weightedActions: row.weightedActions,
      ...(typeof row.averageWatchTimeSeconds === 'number'
        ? { averageWatchTimeSeconds: row.averageWatchTimeSeconds }
        : {}),
    })),
    count: input.contributors.length,
    medianExposure,
  };
}
