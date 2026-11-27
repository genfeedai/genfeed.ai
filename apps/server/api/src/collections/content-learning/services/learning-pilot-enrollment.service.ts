import { randomBytes } from 'node:crypto';
import {
  LearningDependencyService,
  learningOrgFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningPilotCohortV1,
  learningPilotCommittedSeedV1,
  learningPilotSeedCommitmentV1,
} from '@api/collections/content-learning/services/learning-experiment-assignment.helper';
import {
  type LearningActor,
  LearningOperationService,
  learningCanonicalHash,
  learningHash,
} from '@api/collections/content-learning/services/learning-operation.service';
import {
  buildLearningPilotSpecV1,
  LEARNING_PILOT_CONTROL_ARM,
  type LearningPilotCandidate,
  learningPilotApprovedArmsV1,
  learningPilotFreezeAtV1,
  learningPilotWindowV1,
} from '@api/collections/content-learning/services/learning-pilot-spec.helper';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  ContentLearningMode,
  ContentLearningExperimentStatus as ExperimentStatus,
  ContentLearningOperationStatus as OperationStatus,
} from '@genfeedai/contracts';
import type { LearningDependencyKindV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  learningDescriptorTuple,
  validLearningDescriptor,
} from '@genfeedai/harness';
import {
  type ContentLearningAccount,
  type ContentLearningEnrollment,
  type ContentLearningExperiment,
  type Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import { extractString, readRecord } from '@genfeedai/utils/data/extract.util';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

const PRIVATE_PILOT = 'private_pilot';
const OPEN_STATUSES = [
  ExperimentStatus.PREREGISTERED,
  ExperimentStatus.SEALED,
  ExperimentStatus.RUNNING,
];
const CLOSED_STATUSES: string[] = [
  ExperimentStatus.CANCELLED,
  ExperimentStatus.COMPLETED,
  ExperimentStatus.INVALIDATED,
];
const COHORT_FRACTIONS = [1, 0.25, 0.05];

export interface LearningPilotPreregisterInput {
  cellKey: string;
  candidateId: string;
  controlId: string;
  startAt: string;
  endAt: string;
  approvedArmIds: string[];
  requestId: string;
}
export interface LearningPilotEnrollInput {
  noticeVersion: string;
  expectedRevision: number;
  requestId: string;
}
export interface LearningPilotStopInput {
  expectedRevision: number;
  reason: string;
  requestId: string;
}
type DependencyLink = readonly [LearningDependencyKindV1, string];

/**
 * Ends every open enrollment of an account (or of one pilot) and records why.
 * Withdrawn enrollments stop new assignments, and replay of already assigned
 * decisions fails its enrollment check, so queued work is fenced at once.
 */
export async function withdrawLearningPilotEnrollmentsV1(
  tx: Prisma.TransactionClient,
  dependencies: Pick<LearningDependencyService, 'link' | 'resolve'>,
  input: {
    organizationId: string;
    credentialId: string;
    experimentId?: string;
    actorUserId: string;
    reason: string;
    at: Date;
  },
): Promise<string[]> {
  const { organizationId, at } = input;
  const enrollments = await tx.contentLearningEnrollment.findMany({
    where: scopedWhere(organizationId, {
      credentialId: input.credentialId,
      withdrawnAt: null,
      ...(input.experimentId ? { experimentId: input.experimentId } : {}),
    }),
    orderBy: { id: 'asc' },
  });
  for (const enrollment of enrollments) {
    const withdrawn = await tx.contentLearningEnrollment.updateMany({
      where: scopedWhere(organizationId, {
        id: enrollment.id,
        withdrawnAt: null,
      }),
      data: { withdrawnAt: at },
    });
    if (withdrawn.count !== 1)
      throw new ConflictException('Enrollment changed while withdrawing');
    const payload = {
      kind: 'withdrawal' as const,
      reason: input.reason,
      actorUserId: input.actorUserId,
    };
    const eventKey = `withdrawal:${enrollment.id}`;
    const event = await tx.contentLearningExperimentEvent.create({
      data: {
        organizationId,
        brandId: enrollment.brandId,
        credentialId: enrollment.credentialId,
        experimentId: enrollment.experimentId,
        enrollmentId: enrollment.id,
        eventKey,
        kind: 'withdrawal',
        sourceKind: 'enrollment',
        sourceId: enrollment.id,
        sourceRevision: `${enrollment.accountEpoch}:${enrollment.consentNoticeVersion}`,
        occurredAt: at,
        observedAt: at,
        payload: toPrismaJson(payload),
        fingerprint: learningHash([enrollment.experimentId, eventKey, payload]),
      },
    });
    await dependencies.link(
      tx,
      await dependencies.resolve(
        'enrollment',
        enrollment.id,
        organizationId,
        tx,
      ),
      await dependencies.resolve(
        'experiment-event',
        event.id,
        organizationId,
        tx,
      ),
    );
  }
  return enrollments.map(({ id }) => id);
}

/**
 * B4.3 of #5788: a superadmin preregisters a private learning pilot for one
 * tenant account, and that organization's owner enrolls the account. Nothing
 * here changes a prompt: the assignment producer only reads pilots this
 * service has sealed with an included, unwithdrawn enrollment.
 */
@Traced()
@Injectable()
export class LearningPilotEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: LearningOperationService,
    private readonly dependencies: LearningDependencyService,
  ) {}

  /** Superadmin only (the controller's guard); `actor.organizationId` is the tenant. */
  async preregister(
    actor: LearningActor,
    input: LearningPilotPreregisterInput,
  ) {
    const window = learningPilotWindowV1(
      input.startAt,
      input.endAt,
      new Date(),
    );
    if (input.controlId !== LEARNING_PILOT_CONTROL_ARM)
      throw new BadRequestException(
        'A private pilot uses the built-in baseline control',
      );
    const approvedArmIds = learningPilotApprovedArmsV1(input.approvedArmIds);
    const payload = {
      cellKey: input.cellKey,
      candidateId: input.candidateId,
      controlId: input.controlId,
      startAt: window.startAt.toISOString(),
      endAt: window.endAt.toISOString(),
      approvedArmIds,
    };
    const { organizationId } = actor;
    return this.prisma.$transaction(async (tx) => {
      await learningOrgFence(tx, organizationId, 'exclusive');
      const base = this.adminOperation(
        actor,
        input.requestId,
        'experiment-preregister',
        payload,
      );
      const prior = await this.priorOperation(tx, base);
      if (prior) return prior;
      const candidate = await this.candidate(tx, organizationId, input);
      const account = await tx.contentLearningAccount.findFirst({
        where: scopedWhere(organizationId, {
          brandId: candidate.brandId,
          credentialId: candidate.credentialId,
        }),
      });
      if (!account || account.epoch !== candidate.epoch)
        throw new ConflictException(
          'The candidate policy is not in the account’s current epoch',
        );
      await this.assertNoOverlap(tx, organizationId, candidate, window);
      const seed = randomBytes(32).toString('hex');
      const spec = buildLearningPilotSpecV1({
        candidate,
        descriptor: candidate.descriptor,
        window,
        approvedArmIds,
        seedCommitment: learningPilotSeedCommitmentV1(seed),
        account: { id: account.id, epoch: account.epoch },
      });
      const specHash = learningCanonicalHash(spec);
      const experiment = await tx.contentLearningExperiment.create({
        data: {
          organizationId,
          brandId: candidate.brandId,
          credentialId: candidate.credentialId,
          kind: PRIVATE_PILOT,
          cellKey: candidate.scopeKey,
          candidatePolicyId: candidate.id,
          builtInControlVersion: LEARNING_PILOT_CONTROL_ARM,
          spec: toPrismaJson(spec),
          specHash,
          actorUserId: actor.actorId,
          status: ExperimentStatus.PREREGISTERED,
          encryptedSeed: EncryptionUtil.encrypt(seed),
          startAt: window.startAt,
          endAt: window.endAt,
          freezeAt: learningPilotFreezeAtV1(window.endAt),
        },
      });
      await this.linkAll(
        tx,
        organizationId,
        ['experiment', experiment.id],
        [
          ['policy', candidate.id],
          ['account', account.id],
        ],
      );
      return tx.contentLearningOperation.create({
        data: {
          ...base,
          brandId: candidate.brandId,
          credentialId: candidate.credentialId,
          status: OperationStatus.COMPLETED,
          resultReferences: toPrismaJson({
            experimentId: experiment.id,
            specHash,
          }),
        },
      });
    });
  }

  /** Superadmin only. Cancelled pilots stop assigning and fence queued work. */
  async cancel(
    actor: LearningActor,
    experimentId: string,
    input: LearningPilotStopInput,
  ) {
    const { organizationId } = actor;
    return this.prisma.$transaction(async (tx) => {
      await learningOrgFence(tx, organizationId, 'exclusive');
      const base = this.adminOperation(
        actor,
        input.requestId,
        'experiment-cancel',
        {
          experimentId,
          expectedRevision: input.expectedRevision,
          reason: input.reason,
        },
      );
      const prior = await this.priorOperation(tx, base);
      if (prior) return prior;
      const experiment = await this.lockedExperiment(
        tx,
        organizationId,
        experimentId,
      );
      if (CLOSED_STATUSES.includes(experiment.status))
        throw new ConflictException('The pilot has already ended');
      if (experiment.revision !== input.expectedRevision)
        throw new ConflictException({
          reason: 'revision_conflict',
          currentRevision: experiment.revision,
        });
      const cancelled = await tx.contentLearningExperiment.updateMany({
        where: scopedWhere(organizationId, {
          id: experiment.id,
          revision: experiment.revision,
        }),
        data: {
          status: ExperimentStatus.CANCELLED,
          revision: { increment: 1 },
        },
      });
      if (cancelled.count !== 1)
        throw new ConflictException('Experiment revision changed');
      return tx.contentLearningOperation.create({
        data: {
          ...base,
          brandId: experiment.brandId,
          credentialId: experiment.credentialId,
          beforeRevision: experiment.revision,
          afterRevision: experiment.revision + 1,
          status: OperationStatus.COMPLETED,
          resultReferences: toPrismaJson({
            experimentId: experiment.id,
            status: ExperimentStatus.CANCELLED,
          }),
        },
      });
    });
  }

  /**
   * Owner only. Records consent and the cohort draw, then seals the pilot: a
   * sealed pilot with an included enrollment is the only one the assignment
   * producer reads.
   */
  async enroll(
    actor: LearningActor,
    credentialId: string,
    experimentId: string,
    input: LearningPilotEnrollInput,
  ) {
    await this.operations.assertMember(actor, true, true);
    return this.operations.mutateWithReceipt(
      {
        actor,
        credentialId,
        requestId: input.requestId,
        expectedRevision: input.expectedRevision,
        type: 'experiment-enroll',
        payload: { experimentId, noticeVersion: input.noticeVersion },
      },
      (tx, account, operationId) =>
        this.enrollAccount(tx, account, experimentId, {
          noticeVersion: input.noticeVersion,
          operationId,
        }),
    );
  }

  /** Owner or admin: withdraws the account from one pilot. */
  async withdraw(
    actor: LearningActor,
    credentialId: string,
    experimentId: string,
    input: LearningPilotStopInput,
  ) {
    await this.operations.assertMember(actor, true);
    return this.operations.mutate(
      {
        actor,
        credentialId,
        requestId: input.requestId,
        expectedRevision: input.expectedRevision,
        type: 'experiment-withdraw',
        payload: { experimentId, reason: input.reason },
      },
      async (tx) => {
        const enrollmentIds = await withdrawLearningPilotEnrollmentsV1(
          tx,
          this.dependencies,
          {
            organizationId: actor.organizationId,
            credentialId,
            experimentId,
            actorUserId: actor.actorId,
            reason: input.reason,
            at: new Date(),
          },
        );
        if (!enrollmentIds.length)
          throw new NotFoundException('No active enrollment in this pilot');
        return { experimentId, enrollmentIds };
      },
    );
  }

  /** The account's pilots with its own enrollment in each. Never the seed. */
  async list(organizationId: string, credentialId: string) {
    const experiments = await this.prisma.contentLearningExperiment.findMany({
      where: scopedWhere(organizationId, { credentialId, kind: PRIVATE_PILOT }),
      orderBy: [{ startAt: 'desc' }, { id: 'asc' }],
      take: 50,
    });
    const enrollments = experiments.length
      ? await this.prisma.contentLearningEnrollment.findMany({
          where: scopedWhere(organizationId, {
            credentialId,
            experimentId: { in: experiments.map(({ id }) => id) },
          }),
        })
      : [];
    const byExperiment = new Map(
      enrollments.map((row) => [row.experimentId, row]),
    );
    return experiments.map(
      ({ encryptedSeed: _seed, actorUserId: _actor, ...experiment }) => ({
        ...experiment,
        enrollment: enrollmentView(byExperiment.get(experiment.id)),
      }),
    );
  }

  private async enrollAccount(
    tx: Prisma.TransactionClient,
    account: ContentLearningAccount,
    experimentId: string,
    consent: { noticeVersion: string; operationId: string },
  ) {
    const { organizationId } = account;
    const now = new Date();
    const experiment = await this.lockedExperiment(
      tx,
      organizationId,
      experimentId,
    );
    if (
      experiment.kind !== PRIVATE_PILOT ||
      experiment.credentialId !== account.credentialId ||
      experiment.brandId !== account.brandId
    )
      throw new NotFoundException('Pilot not found for this account');
    if (
      experiment.status !== ExperimentStatus.PREREGISTERED ||
      experiment.sealedAt
    )
      throw new ConflictException('The pilot is not open for enrollment');
    if (now.getTime() >= experiment.endAt.getTime())
      throw new ConflictException('The pilot window has ended');
    if (account.mode === ContentLearningMode.DISABLED || account.failureReason)
      throw new ConflictException(
        'Learning must be enabled and healthy before enrolling',
      );
    if (
      learningCanonicalHash(experiment.spec) !== experiment.specHash ||
      !(await this.dependencies.valid(
        'experiment',
        experiment.id,
        tx,
        organizationId,
      ))
    )
      throw new ConflictException(
        'The pilot spec or its evidence is no longer valid',
      );
    const spec = readRecord(experiment.spec);
    const seed = learningPilotCommittedSeedV1(
      experiment,
      extractString(spec, 'seedCommitment'),
    );
    const fraction = spec.cohortFraction;
    if (
      !seed ||
      typeof fraction !== 'number' ||
      !COHORT_FRACTIONS.includes(fraction)
    )
      throw new ConflictException('The pilot seed commitment is unverifiable');
    const cohort = learningPilotCohortV1(
      seed,
      [experiment.id, organizationId, account.credentialId, account.epoch],
      fraction,
    );
    const enrollment = await tx.contentLearningEnrollment.create({
      data: {
        organizationId,
        brandId: account.brandId,
        credentialId: account.credentialId,
        experimentId: experiment.id,
        accountEpoch: account.epoch,
        ownerOperationId: consent.operationId,
        consentNoticeVersion: consent.noticeVersion,
        consentAt: now,
        cohortHash: cohort.cohortHash,
        included: cohort.included,
        cohortFraction: fraction,
        startAt: new Date(
          Math.max(now.getTime(), experiment.startAt.getTime()),
        ),
        endAt: experiment.endAt,
        baselineSnapshot: toPrismaJson(baselineSnapshot(account)),
        cadenceSnapshot: toPrismaJson({
          schemaVersion: 1,
          captured: false,
          reason: 'cadence_source_unavailable',
        }),
      },
    });
    const sealed = await tx.contentLearningExperiment.updateMany({
      where: scopedWhere(organizationId, {
        id: experiment.id,
        status: ExperimentStatus.PREREGISTERED,
        revision: experiment.revision,
        sealedAt: null,
      }),
      data: {
        status: ExperimentStatus.SEALED,
        sealedAt: now,
        revision: { increment: 1 },
      },
    });
    if (sealed.count !== 1)
      throw new ConflictException('Experiment revision changed');
    await this.linkAll(
      tx,
      organizationId,
      ['enrollment', enrollment.id],
      [
        ['experiment', experiment.id],
        ['account', account.id],
      ],
    );
    return {
      experimentId: experiment.id,
      enrollmentId: enrollment.id,
      included: enrollment.included,
      cohortHash: enrollment.cohortHash,
      sealedAt: now.toISOString(),
    };
  }

  private async candidate(
    tx: Prisma.TransactionClient,
    organizationId: string,
    input: Pick<LearningPilotPreregisterInput, 'candidateId' | 'cellKey'>,
  ) {
    const policy = await tx.contentLearningPolicyVersion.findFirst({
      where: scopedWhere(organizationId, {
        id: input.candidateId,
        scopeKey: input.cellKey,
        synthetic: false,
        state: { in: ['shadow', 'active'] },
      }),
    });
    if (!policy)
      throw new NotFoundException('Candidate policy not found in this cell');
    const descriptor = policy.cellDescriptor;
    if (
      !policy.descriptorHash ||
      !validLearningDescriptor(descriptor) ||
      learningHash(learningDescriptorTuple(descriptor)) !==
        policy.descriptorHash
    )
      throw new ConflictException('The candidate cell descriptor is invalid');
    if (
      !(await this.dependencies.valid('policy', policy.id, tx, organizationId))
    )
      throw new ConflictException(
        'The candidate policy evidence is no longer valid',
      );
    const candidate: LearningPilotCandidate & {
      brandId: string;
      credentialId: string;
      descriptor: typeof descriptor;
    } = { ...policy, descriptorHash: policy.descriptorHash, descriptor };
    return candidate;
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    organizationId: string,
    candidate: { credentialId: string; scopeKey: string },
    window: { startAt: Date; endAt: Date },
  ) {
    // The assignment producer reads exactly one current pilot per cell and
    // assigns nothing when two match, so overlapping pilots are refused here.
    const overlapping = await tx.contentLearningExperiment.findFirst({
      where: scopedWhere(organizationId, {
        credentialId: candidate.credentialId,
        cellKey: candidate.scopeKey,
        kind: PRIVATE_PILOT,
        status: { in: OPEN_STATUSES },
        startAt: { lt: window.endAt },
        endAt: { gt: window.startAt },
      }),
      select: { id: true },
    });
    if (overlapping)
      throw new ConflictException(
        'Another pilot already covers this cell and window',
      );
  }

  private async lockedExperiment(
    tx: Prisma.TransactionClient,
    organizationId: string,
    experimentId: string,
  ): Promise<ContentLearningExperiment> {
    await tx.$queryRaw`SELECT id FROM content_learning_experiments WHERE id = ${experimentId} AND "organizationId" = ${organizationId} AND "isDeleted" = false FOR UPDATE`;
    const experiment = await tx.contentLearningExperiment.findFirst({
      where: scopedWhere(organizationId, { id: experimentId }),
    });
    if (!experiment) throw new NotFoundException('Pilot not found');
    return experiment;
  }

  private adminOperation(
    actor: LearningActor,
    requestId: string,
    type: string,
    payload: unknown,
  ) {
    const scope = learningHash(['experiment-admin', actor.organizationId]);
    return {
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      scope,
      requestId,
      type,
      payloadHash: learningHash([type, scope, payload]),
    };
  }

  private async priorOperation(
    tx: Prisma.TransactionClient,
    base: ReturnType<LearningPilotEnrollmentService['adminOperation']>,
  ) {
    const prior = await tx.contentLearningOperation.findFirst({
      where: scopedWhere(base.organizationId, {
        actorId: base.actorId,
        scope: base.scope,
        requestId: base.requestId,
      }),
    });
    if (
      prior &&
      (prior.payloadHash !== base.payloadHash || prior.type !== base.type)
    )
      throw new ConflictException('Request key payload conflict');
    return prior;
  }

  private async linkAll(
    tx: Prisma.TransactionClient,
    organizationId: string,
    derived: DependencyLink,
    sources: readonly DependencyLink[],
  ) {
    const target = await this.dependencies.resolve(
      derived[0],
      derived[1],
      organizationId,
      tx,
    );
    for (const [kind, id] of sources)
      await this.dependencies.link(
        tx,
        await this.dependencies.resolve(kind, id, organizationId, tx),
        target,
      );
  }
}

function baselineSnapshot(account: ContentLearningAccount) {
  return {
    schemaVersion: 1,
    accountId: account.id,
    epoch: account.epoch,
    revision: account.revision,
    evidenceRevision: account.evidenceRevision,
    mode: account.mode,
    activeConfigVersion: account.activeConfigVersion,
    activePolicyId: account.activePolicyId,
    pinnedReleaseId: account.pinnedReleaseId,
    approvedArmIds: [...account.approvedArmIds].sort(),
  };
}

function enrollmentView(enrollment: ContentLearningEnrollment | undefined) {
  if (!enrollment) return null;
  return {
    id: enrollment.id,
    included: enrollment.included,
    consentNoticeVersion: enrollment.consentNoticeVersion,
    consentAt: enrollment.consentAt,
    withdrawnAt: enrollment.withdrawnAt,
    startAt: enrollment.startAt,
    endAt: enrollment.endAt,
  };
}
