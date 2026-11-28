import { learningCanonicalHash } from '@api/collections/content-learning/services/learning-operation.service';
import type {
  LearningCellDescriptor,
  LearningExperimentSpecV1,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { LEARNING_ARMS, type LearningArmId } from '@genfeedai/harness';
import type { ContentLearningPolicyVersion } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';

/** Private pilots compare a candidate policy against the built-in baseline. */
export const LEARNING_PILOT_CONTROL_ARM: LearningArmId = 'baseline-v1';
/** The assignment producer only accepts this treatment probability. */
export const LEARNING_PILOT_TREATMENT_PROBABILITY = 0.1;
/** A private pilot covers its one account, so every enrollment is included. */
export const LEARNING_PILOT_COHORT_FRACTION = 1;
export const LEARNING_PILOT_MAX_DAYS = 90;
const DEADLINES: LearningExperimentSpecV1['deadlines'] = {
  generationHours: 24,
  publicationHours: 168,
  checkpointHours: 49,
  settlementGraceHours: 24,
};
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type LearningPilotCandidate = Pick<
  ContentLearningPolicyVersion,
  | 'id'
  | 'version'
  | 'scopeKey'
  | 'epoch'
  | 'configVersion'
  | 'featureSchema'
  | 'evidenceManifestHash'
> & { descriptorHash: string };

export interface LearningPilotWindow {
  startAt: Date;
  endAt: Date;
}

/**
 * Parses a preregistration window. A pilot is registered before it starts, so
 * nothing observed inside the window can have shaped its spec.
 */
export function learningPilotWindowV1(
  startAt: string,
  endAt: string,
  now: Date,
): LearningPilotWindow {
  const window = { startAt: new Date(startAt), endAt: new Date(endAt) };
  const start = window.startAt.getTime();
  const end = window.endAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end))
    throw new BadRequestException('Pilot window dates are invalid');
  if (start <= now.getTime())
    throw new BadRequestException(
      'A pilot must be preregistered before it starts',
    );
  if (end <= start || end - start > LEARNING_PILOT_MAX_DAYS * DAY_MS)
    throw new BadRequestException(
      `A pilot window must end after it starts and last at most ${LEARNING_PILOT_MAX_DAYS} days`,
    );
  return window;
}

/**
 * The arms a pilot may apply: the baseline plus at least one learned arm, in
 * a canonical order so the spec hash does not depend on input order.
 */
export function learningPilotApprovedArmsV1(armIds: string[]): LearningArmId[] {
  const known = new Set<string>(LEARNING_ARMS);
  if (armIds.some((armId) => !known.has(armId)))
    throw new BadRequestException('Unsupported arm');
  const arms = new Set<string>([...armIds, LEARNING_PILOT_CONTROL_ARM]);
  if (arms.size < 2)
    throw new BadRequestException('A pilot needs at least one learned arm');
  return LEARNING_ARMS.filter((armId) => arms.has(armId));
}

/** When late evidence for the window stops counting toward the report. */
export function learningPilotFreezeAtV1(endAt: Date): Date {
  const hours =
    DEADLINES.publicationHours +
    DEADLINES.checkpointHours +
    DEADLINES.settlementGraceHours;
  return new Date(endAt.getTime() + hours * HOUR_MS);
}

/**
 * The frozen private pilot spec. Every field the assignment producer and the
 * applied-tactic gate compare is copied from the candidate policy and its cell
 * descriptor, so a later change to either no longer matches the spec hash.
 */
export function buildLearningPilotSpecV1(input: {
  candidate: LearningPilotCandidate;
  descriptor: LearningCellDescriptor;
  window: LearningPilotWindow;
  approvedArmIds: LearningArmId[];
  seedCommitment: string;
  account: { id: string; epoch: number };
}): LearningExperimentSpecV1 {
  const { candidate, descriptor, window, account } = input;
  return {
    schemaVersion: 1,
    kind: 'private_pilot',
    cellKey: candidate.scopeKey,
    configVersion: candidate.configVersion,
    featureVersion: candidate.featureSchema,
    rewardVersion: descriptor.configVersion,
    checkpointVersion: descriptor.windowId,
    candidateId: candidate.id,
    candidateHash: candidate.evidenceManifestHash,
    controlId: LEARNING_PILOT_CONTROL_ARM,
    controlHash: learningCanonicalHash({
      builtInControl: LEARNING_PILOT_CONTROL_ARM,
      armCatalogVersion: descriptor.armCatalogVersion,
    }),
    builtInControlVersion: LEARNING_PILOT_CONTROL_ARM,
    format: descriptor.format,
    objective: descriptor.objective,
    rewardProfileId: candidate.descriptorHash,
    startAt: window.startAt.toISOString(),
    endAt: window.endAt.toISOString(),
    assignmentUnit: 'request_destination_candidate',
    treatmentProbability: LEARNING_PILOT_TREATMENT_PROBABILITY,
    cohortFraction: LEARNING_PILOT_COHORT_FRACTION,
    seedCommitment: input.seedCommitment,
    deadlines: DEADLINES,
    analysisVersion: 'rl-experiment-v1',
    primary: 'composite_reward',
    gateVersion: 'rl-promotion-v1',
    costBasis: 'observed_vendor_micro_usd',
    cadenceBasis: 'published_descendants_per_opportunity_day',
    approvedArmIds: input.approvedArmIds,
    sourceManifestHash: learningCanonicalHash({
      account,
      candidate: {
        id: candidate.id,
        version: candidate.version,
        epoch: candidate.epoch,
        evidenceManifestHash: candidate.evidenceManifestHash,
      },
      cell: {
        scopeKey: candidate.scopeKey,
        descriptorHash: candidate.descriptorHash,
      },
    }),
    synthetic: false,
  };
}
