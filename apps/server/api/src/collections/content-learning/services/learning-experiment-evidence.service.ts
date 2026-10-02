import { randomUUID } from 'node:crypto';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  isLearningGlobalDependencyKind,
  type LearningCostAttributionV1,
  type LearningDependencyKindV1,
  type LearningExperimentPayloadV1,
  validLearningDependencyKind,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

function learningEvidenceSourceKind(kind: string): LearningDependencyKindV1 {
  const mapped =
    kind === 'llm-ledger'
      ? 'llm_vendor_cost'
      : kind === 'media-ledger'
        ? 'media_vendor_cost'
        : kind;
  if (!validLearningDependencyKind(mapped))
    throw new ConflictException('Invalid dependency identity');
  return mapped;
}
@Injectable()
export class LearningExperimentEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dependencies: LearningDependencyService,
  ) {}
  async append(input: {
    organizationId: string;
    opportunityId: string;
    eventKey: string;
    sourceKind: string;
    sourceId: string;
    sourceRevision: string;
    occurredAt: Date;
    payload: LearningExperimentPayloadV1;
    supersedesId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await learningFence(tx, input.supersedesId ? 'exclusive' : 'shared');
      const opportunity = await tx.contentLearningOpportunity.findFirst({
        where: {
          id: input.opportunityId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
      if (!opportunity)
        throw new BadRequestException('Opportunity scope mismatch');
      const fingerprint = learningHash([
        input.eventKey,
        input.sourceKind,
        input.sourceId,
        input.sourceRevision,
        input.occurredAt.toISOString(),
        input.payload,
      ]);
      const previous = await tx.contentLearningExperimentEvent.findFirst({
        where: {
          experimentId: opportunity.experimentId,
          organizationId: input.organizationId,
          eventKey: input.eventKey,
          isDeleted: false,
        },
      });
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new ConflictException('Immutable event key payload conflict');
        return previous;
      }
      if (input.supersedesId) {
        const original = await tx.contentLearningExperimentEvent.findFirst({
          where: {
            id: input.supersedesId,
            organizationId: input.organizationId,
            opportunityId: opportunity.id,
            isDeleted: false,
          },
        });
        if (!original)
          throw new BadRequestException('Correction scope mismatch');
        await this.dependencies.invalidate(
          'experiment-event',
          original.id,
          tx,
          input.organizationId,
        );
      }
      const event = await tx.contentLearningExperimentEvent.create({
        data: {
          experimentId: opportunity.experimentId,
          opportunityId: opportunity.id,
          enrollmentId: opportunity.enrollmentId,
          organizationId: opportunity.organizationId,
          brandId: opportunity.brandId,
          credentialId: opportunity.credentialId,
          eventKey: input.eventKey,
          kind: input.payload.kind,
          sourceKind: input.sourceKind,
          sourceId: input.sourceId,
          sourceRevision: input.sourceRevision,
          occurredAt: input.occurredAt,
          observedAt: new Date(),
          payload: toPrismaJson(input.payload),
          supersedesId: input.supersedesId,
          fingerprint,
        },
      });
      const sourceKind = learningEvidenceSourceKind(input.sourceKind);
      await this.dependencies.link(
        tx,
        await this.dependencies.resolve(
          sourceKind,
          input.sourceId,
          isLearningGlobalDependencyKind(sourceKind)
            ? null
            : input.organizationId,
          tx,
        ),
        await this.dependencies.resolve(
          'experiment-event',
          event.id,
          input.organizationId,
          tx,
        ),
      );
      return event;
    });
  }
  async recordCostAttempt(
    input: LearningCostAttributionV1 & {
      provider: string;
      model: string;
      attemptId?: string;
      startedAt?: Date;
    },
  ) {
    if (
      !input.opportunityIds.length ||
      input.allocationWeights.length !== input.opportunityIds.length ||
      input.allocationWeights.some(
        (weight) =>
          !Number.isFinite(weight) ||
          Math.abs(weight - 1 / input.opportunityIds.length) > 1e-12,
      )
    )
      throw new BadRequestException('Equal immutable allocation required');
    const attemptId = input.attemptId ?? randomUUID(),
      startedAt = input.startedAt ?? new Date();
    for (const opportunityId of input.opportunityIds)
      await this.append({
        organizationId: input.organizationId,
        opportunityId,
        eventKey: `cost_attempt:${attemptId}:${opportunityId}`,
        sourceKind: 'provider_attempt',
        sourceId: attemptId,
        sourceRevision: '1',
        occurredAt: startedAt,
        payload: {
          kind: 'cost_attempt',
          attemptId,
          opportunityIds: [...input.opportunityIds],
          allocationWeights: [...input.allocationWeights],
          provider: input.provider,
          model: input.model,
          startedAt: startedAt.toISOString(),
          workflowExecutionId: input.workflowExecutionId,
          nodeId: input.nodeId,
          runId: input.runId,
          ingredientId: input.ingredientId,
        },
      });
    return attemptId;
  }
  async recordCostSettlement(input: {
    organizationId: string;
    attemptId: string;
    ledgerId: string;
    ledgerKind: 'llm' | 'media';
  }) {
    const ledger =
      input.ledgerKind === 'llm'
        ? await this.prisma.llmVendorCost.findFirst({
            where: {
              id: input.ledgerId,
              organizationId: input.organizationId,
              isDeleted: false,
            },
          })
        : await this.prisma.mediaVendorCost.findFirst({
            where: {
              id: input.ledgerId,
              organizationId: input.organizationId,
              isDeleted: false,
            },
          });
    if (!ledger)
      throw new BadRequestException('Scoped persisted ledger row required');
    const attempts = await this.prisma.contentLearningExperimentEvent.findMany({
      where: {
        organizationId: input.organizationId,
        kind: 'cost_attempt',
        sourceKind: 'provider_attempt',
        sourceId: input.attemptId,
        isDeleted: false,
      },
    });
    if (!attempts.length)
      throw new BadRequestException('Cost attempt must precede settlement');
    const costEvidence = [
      'observed',
      'calculated',
      'byok',
      'unknown',
      'pending',
    ].includes(ledger.costEvidence ?? '')
      ? (ledger.costEvidence as
          | 'observed'
          | 'calculated'
          | 'byok'
          | 'unknown'
          | 'pending')
      : 'unknown';
    const ledgerFingerprint = learningHash([
      ledger.id,
      ledger.vendorCostMicros,
      costEvidence,
      ledger.updatedAt.toISOString(),
    ]);
    const vendorCostMicros =
      Number.isSafeInteger(ledger.vendorCostMicros) &&
      ledger.vendorCostMicros >= 0
        ? ledger.vendorCostMicros
        : null;
    for (const attempt of attempts)
      if (attempt.opportunityId)
        await this.append({
          organizationId: input.organizationId,
          opportunityId: attempt.opportunityId,
          eventKey: `cost_settlement:${input.attemptId}:${attempt.opportunityId}:${ledgerFingerprint}`,
          sourceKind:
            input.ledgerKind === 'llm'
              ? 'llm_vendor_cost'
              : 'media_vendor_cost',
          sourceId: ledger.id,
          sourceRevision: ledgerFingerprint,
          occurredAt: ledger.updatedAt,
          payload: {
            kind: 'cost_settlement',
            attemptId: input.attemptId,
            ledgerId: ledger.id,
            ledgerKind: input.ledgerKind,
            ledgerFingerprint,
            vendorCostMicros,
            costEvidence,
            terminal: costEvidence !== 'pending',
          },
        });
    return ledgerFingerprint;
  }
}
