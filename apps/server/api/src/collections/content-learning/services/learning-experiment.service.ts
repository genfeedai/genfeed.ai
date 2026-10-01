import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import {
  type LearningActor,
  LearningOperationService,
  learningHash,
} from '@api/collections/content-learning/services/learning-operation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  LearningAllocatedCostV1,
  LearningExperimentPayloadV1,
  LearningExperimentSpecV1,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import {
  buildLearningExperimentReport,
  type LearningExperimentObservation,
} from '@genfeedai/harness';
import {
  type ContentLearningExperimentEvent,
  type ContentLearningOpportunity,
  toPrismaJson,
} from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

type Evidence = Omit<ContentLearningExperimentEvent, 'payload'> & {
  payload: LearningExperimentPayloadV1;
};
export function learningOpportunityObservation(
  opportunity: ContentLearningOpportunity,
  events: readonly Evidence[],
  reward: number | null,
  rewardReason?: string,
): LearningExperimentObservation {
  const assigned = opportunity.assignedAt.getTime(),
    hour = 3600000;
  const timely = (event: Evidence, hours: number) =>
    event.occurredAt.getTime() >= assigned &&
    event.occurredAt.getTime() <= assigned + hours * hour &&
    event.observedAt.getTime() <= assigned + (hours + 24) * hour;
  const superseded = new Set(
    events.flatMap((event) => (event.supersedesId ? [event.supersedesId] : [])),
  );
  const current = events
    .filter((event) => !superseded.has(event.id))
    .sort(
      (a, b) =>
        a.occurredAt.getTime() - b.occurredAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  const artifactEvent = current.find(
    (event) =>
      event.payload.kind === 'artifact' &&
      event.payload.artifactHash &&
      timely(event, 24),
  );
  const artifact =
    artifactEvent?.payload.kind === 'artifact' ? artifactEvent.payload : null;
  const readinessEvent = current
    .filter(
      (event) =>
        event.payload.kind === 'readiness' &&
        event.payload.artifactHash === artifact?.artifactHash &&
        timely(event, 168),
    )
    .at(-1);
  const readiness =
    readinessEvent?.payload.kind === 'readiness'
      ? readinessEvent.payload
      : null;
  const publications = current.filter(
    (event) => event.payload.kind === 'publish' && timely(event, 168),
  );
  const original = publications.find(
    (event) =>
      event.payload.kind === 'publish' &&
      event.payload.originalArtifact &&
      event.payload.artifactHash === artifact?.artifactHash,
  );
  const approvalCutoff =
    original?.occurredAt.getTime() ?? assigned + 168 * hour;
  const approval = current
    .filter(
      (event) =>
        event.payload.kind === 'approval' &&
        event.payload.artifactHash === artifact?.artifactHash &&
        timely(event, 168) &&
        event.occurredAt.getTime() <= approvalCutoff,
    )
    .at(-1);
  const approved =
    approval?.payload.kind === 'approval' &&
    approval.payload.status === 'approved';
  const attempts = current.filter(
    (event) => event.payload.kind === 'cost_attempt',
  );
  const costAllocations: LearningAllocatedCostV1[] = [];
  let costKnown = true;
  for (const attempt of attempts) {
    if (attempt.payload.kind !== 'cost_attempt') continue;
    const payload = attempt.payload;
    const index = payload.opportunityIds.indexOf(opportunity.id),
      weight = payload.allocationWeights[index];
    const settlement = current
      .filter(
        (event) =>
          event.payload.kind === 'cost_settlement' &&
          event.payload.attemptId === payload.attemptId,
      )
      .at(-1);
    if (
      index < 0 ||
      !Number.isFinite(weight) ||
      Math.abs(weight - 1 / payload.opportunityIds.length) > 1e-12 ||
      !settlement ||
      settlement.payload.kind !== 'cost_settlement' ||
      !settlement.payload.terminal ||
      settlement.payload.costEvidence !== 'observed' ||
      settlement.payload.vendorCostMicros === null ||
      !Number.isSafeInteger(settlement.payload.vendorCostMicros) ||
      settlement.payload.vendorCostMicros < 0
    ) {
      costKnown = false;
      continue;
    }
    costAllocations.push({
      attemptId: payload.attemptId,
      ledgerKind: settlement.payload.ledgerKind,
      ledgerId: settlement.payload.ledgerId,
      ledgerFingerprint: settlement.payload.ledgerFingerprint,
      vendorCostMicros: settlement.payload.vendorCostMicros,
      opportunityIds: [...payload.opportunityIds],
    });
  }
  const closing = current
    .filter(
      (event) =>
        event.payload.kind === 'artifact' && event.payload.generationClosed,
    )
    .at(-1);
  const generationClosed =
    closing?.payload.kind === 'artifact' && closing.payload.generationClosed;
  if (
    !attempts.length &&
    !(
      closing?.payload.kind === 'artifact' &&
      closing.payload.noProviderDispatch === true
    )
  )
    costKnown = false;
  const cadence = current
    .filter((event) => event.payload.kind === 'cadence')
    .at(-1);
  const publicationIds = new Set(
    publications.flatMap((event) =>
      event.payload.kind === 'publish' ? [event.payload.postId] : [],
    ),
  );
  const cadencePayload =
    cadence?.payload.kind === 'cadence' ? cadence.payload : null;
  const enumeratedIds = cadencePayload
    ? new Set(cadencePayload.descendantPostIds)
    : null;
  const enumerationComplete =
    cadencePayload?.enumerationComplete === true &&
    enumeratedIds !== null &&
    [...publicationIds].every((id) => enumeratedIds.has(id));
  const unchanged =
    !!original &&
    !current.some(
      (event) => event.payload.kind === 'edit' && timely(event, 168),
    );
  const observedReward =
    unchanged && reward !== null && Number.isFinite(reward) ? reward : null;
  return {
    id: opportunity.id,
    accountGroup: learningHash([
      opportunity.organizationId,
      opportunity.credentialId,
    ]),
    assignedAt: opportunity.assignedAt.toISOString(),
    group: opportunity.group === 'treatment' ? 'treatment' : 'control',
    generated: artifact !== null,
    readinessKnown: readiness !== null && readiness.mediaStatus !== 'unknown',
    publishable:
      readiness && readiness.mediaStatus !== 'unknown'
        ? readiness.scopeValid &&
          readiness.textNonempty &&
          ['ready', 'not_applicable'].includes(readiness.mediaStatus) &&
          readiness.blockerCodes.length === 0
        : null,
    approved,
    published: publications.length > 0,
    unchanged,
    reward: observedReward,
    censorReason:
      observedReward === null
        ? (rewardReason ??
          (!artifact
            ? 'generation_incomplete'
            : !original
              ? 'original_unpublished'
              : !unchanged
                ? 'edited_artifact'
                : 'checkpoint_unavailable'))
        : undefined,
    costAllocations: costKnown && generationClosed ? costAllocations : null,
    attemptCount: attempts.length,
    generationClosed,
    publishedDescendants: enumerationComplete
      ? enumeratedIds.size
      : publicationIds.size,
    publicationEnumerationComplete: enumerationComplete,
    criticalSafetyFailure: current.some(
      (event) => event.payload.kind === 'safety' && event.payload.critical,
    ),
    cadenceChanged: cadencePayload?.changed ?? false,
    evidenceIds: current.map((event) => event.id),
  };
}
@Injectable()
export class LearningExperimentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: LearningOperationService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  async read(organizationId: string, id: string) {
    const experiment = await this.prisma.contentLearningExperiment.findFirst({
      where: { id, organizationId, isDeleted: false },
    });
    if (!experiment) throw new NotFoundException('Experiment not found');
    return experiment;
  }
  async list(organizationId: string, page = 1, limit = 20) {
    return this.prisma.contentLearningExperiment.findMany({
      where: { organizationId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
  async report(organizationId: string, id: string) {
    const event = await this.prisma.contentLearningExperimentEvent.findFirst({
      where: { id, organizationId, kind: 'report', isDeleted: false },
    });
    if (!event) throw new NotFoundException('Report not found');
    return event;
  }
  async evaluate(
    actor: LearningActor,
    input: {
      kind: 'online';
      experimentId: string;
      expectedRevision: number;
      requestId: string;
    },
  ) {
    await this.operations.assertMember(actor, true);
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, 'shared');
      await tx.$queryRaw`SELECT id FROM content_learning_experiments WHERE id = ${input.experimentId} AND "organizationId" = ${actor.organizationId} AND "isDeleted" = false FOR UPDATE`;
      const experiment = await tx.contentLearningExperiment.findFirst({
        where: {
          id: input.experimentId,
          organizationId: actor.organizationId,
          isDeleted: false,
        },
      });
      if (!experiment) throw new NotFoundException('Experiment not found');
      const eventKey = `report:${input.requestId}`,
        previous = await tx.contentLearningExperimentEvent.findFirst({
          where: {
            experimentId: experiment.id,
            organizationId: actor.organizationId,
            eventKey,
            isDeleted: false,
          },
        });
      const requestHash = learningHash(input);
      if (previous) {
        if (previous.sourceRevision !== requestHash)
          throw new ConflictException('Request key payload conflict');
        return previous;
      }
      if (experiment.revision !== input.expectedRevision)
        throw new ConflictException('Experiment revision changed');
      const raw = experiment.spec;
      if (
        !raw ||
        typeof raw !== 'object' ||
        Array.isArray(raw) ||
        raw.schemaVersion !== 1 ||
        raw.analysisVersion !== 'rl-experiment-v1'
      )
        throw new BadRequestException('Stored experiment spec is invalid');
      const spec = raw as unknown as LearningExperimentSpecV1,
        now = new Date();
      const opportunities = await tx.contentLearningOpportunity.findMany({
        where: {
          experimentId: experiment.id,
          organizationId: actor.organizationId,
          isDeleted: false,
          assignedAt: { gte: experiment.startAt, lt: experiment.endAt },
        },
        orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
      });
      const observations: LearningExperimentObservation[] = [],
        allEvidenceIds: string[] = [];
      let valid =
        experiment.status !== 'cancelled' &&
        (await this.dependencies.valid(
          'experiment',
          experiment.id,
          tx,
          actor.organizationId,
        ));
      for (const opportunity of opportunities) {
        const events = await tx.contentLearningExperimentEvent.findMany({
          where: {
            opportunityId: opportunity.id,
            organizationId: opportunity.organizationId,
            isDeleted: false,
          },
        });
        const evidence: Evidence[] = [];
        for (const event of events) {
          if (
            !event.payload ||
            typeof event.payload !== 'object' ||
            Array.isArray(event.payload) ||
            typeof event.payload.kind !== 'string' ||
            event.payload.kind !== event.kind
          ) {
            valid = false;
            continue;
          }
          if (
            !(await this.dependencies.valid(
              'experiment-event',
              event.id,
              tx,
              event.organizationId,
            ))
          ) {
            valid = false;
            continue;
          }
          evidence.push({
            ...event,
            payload: event.payload as unknown as LearningExperimentPayloadV1,
          });
        }
        const decision = await tx.contentLearningDecision.findFirst({
          where: {
            opportunityId: opportunity.id,
            organizationId: opportunity.organizationId,
            credentialId: opportunity.credentialId,
            isDeleted: false,
          },
        });
        const reward = decision
          ? await tx.contentLearningReward.findFirst({
              where: {
                decisionId: decision.id,
                organizationId: opportunity.organizationId,
                credentialId: opportunity.credentialId,
                isDeleted: false,
              },
              orderBy: { version: 'desc' },
            })
          : null;
        const rewardValid =
          reward &&
          reward.status === 'valid' &&
          (await this.dependencies.valid(
            'reward',
            reward.id,
            tx,
            opportunity.organizationId,
          ));
        if (rewardValid) allEvidenceIds.push(reward.id);
        observations.push(
          learningOpportunityObservation(
            opportunity,
            evidence,
            rewardValid ? reward.composite : null,
            reward?.reasons[0],
          ),
        );
        allEvidenceIds.push(...evidence.map((event) => event.id));
      }
      const manifestHash = learningHash(allEvidenceIds.sort());
      const report = buildLearningExperimentReport({
        experimentId: experiment.id,
        spec,
        specHash: experiment.specHash,
        observations,
        cutoff: now,
        evidenceManifestHash: manifestHash,
        invalidationRevision: experiment.revision,
        dependenciesValid: valid,
      });
      const payload: LearningExperimentPayloadV1 = {
        kind: 'report',
        report,
        reportHash: learningHash(report),
      };
      const event = await tx.contentLearningExperimentEvent.create({
        data: {
          organizationId: actor.organizationId,
          experimentId: experiment.id,
          eventKey,
          kind: 'report',
          sourceKind: 'experiment',
          sourceId: experiment.id,
          sourceRevision: requestHash,
          occurredAt: now,
          observedAt: now,
          payload: toPrismaJson(payload),
          fingerprint: learningHash([experiment.id, eventKey, payload]),
        },
      });
      await this.dependencies.link(
        tx,
        await this.dependencies.resolve(
          'experiment',
          experiment.id,
          actor.organizationId,
          tx,
        ),
        await this.dependencies.resolve(
          'experiment-event',
          event.id,
          actor.organizationId,
          tx,
        ),
      );
      for (const id of allEvidenceIds) {
        const sourceKind = observations.some((row) =>
          row.evidenceIds.includes(id),
        )
          ? 'experiment-event'
          : 'reward';
        await this.dependencies.link(
          tx,
          await this.dependencies.resolve(
            sourceKind,
            id,
            actor.organizationId,
            tx,
          ),
          await this.dependencies.resolve(
            'experiment-event',
            event.id,
            actor.organizationId,
            tx,
          ),
        );
      }
      // tenant-scope-ignore: unique id mutation after organization-scoped lock
      await tx.contentLearningExperiment.update({
        where: { id: experiment.id },
        data: { revision: { increment: 1 } },
      });
      return event;
    });
  }
}
