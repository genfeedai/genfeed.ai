import {
  type BrandedGenerationJsonV1,
  canonicalizeBrandedGenerationJsonV1,
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationRequestV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type {
  BrandedGenerationActorV1,
  BrandedGenerationArtifactCompletionV1,
  BrandedGenerationBlockReasonV1,
  BrandedGenerationDispatchInputV1,
  BrandedGenerationFailureInputV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import {
  BRANDED_GENERATION_DISPATCH_WINDOW_MS,
  canTransitionBrandedGenerationStateV1,
  classifyBrandedGenerationReadinessV1,
} from '@api/services/branded-generation-receipts/branded-generation-state.util';
import {
  brandedGenerationReceiptV1Schema,
  brandGenerationArtifactV1Schema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationReportV1,
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
  BrandGenerationArtifactV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { BadRequestException, ConflictException } from '@nestjs/common';

export function withDiagnostic(
  diagnostics: BrandedGenerationReceiptV1['diagnostics'],
  canonical: BrandedGenerationReceiptV1['diagnostics'][number],
): BrandedGenerationReceiptV1['diagnostics'] {
  const result = diagnostics.map((diagnostic) => ({
    ...diagnostic,
    ...(diagnostic.evidenceIds !== undefined
      ? { evidenceIds: [...diagnostic.evidenceIds] }
      : {}),
  }));
  const existing = result.findIndex(
    (diagnostic) => diagnostic.code === canonical.code,
  );
  if (existing >= 0) {
    result[existing] = canonical;
    return result;
  }
  if (result.length === 128) {
    let index = -1;
    for (const severity of ['info', 'warning', 'error'] as const) {
      for (let candidate = result.length - 1; candidate >= 0; candidate -= 1) {
        if (result[candidate].severity === severity) {
          index = candidate;
          break;
        }
      }
      if (index >= 0) break;
    }
    const omitted = result[index];
    const projection = {
      code: omitted.code,
      severity: omitted.severity,
      message: omitted.message,
      ...(omitted.ruleId !== undefined ? { ruleId: omitted.ruleId } : {}),
      ...(omitted.evidenceIds !== undefined
        ? { evidenceIds: omitted.evidenceIds }
        : {}),
    };
    const hash = hashBrandedGenerationTextV1(
      canonicalizeBrandedGenerationJsonV1(projection),
    );
    result.splice(index, 1);
    canonical.message = `${canonical.message}. One prior diagnostic was omitted: ${omitted.code} (${omitted.severity}); diagnostic hash ${hash}.`;
  }
  result.push(canonical);
  return result;
}

export function projectBrandedGenerationDispatchV1(
  current: BrandedGenerationReceiptV1,
  input: BrandedGenerationDispatchInputV1,
  clock: () => number,
): BrandedGenerationReceiptV1 {
  if (
    !canTransitionBrandedGenerationStateV1(
      current.state,
      'dispatched',
      'dispatch',
    )
  )
    throw new ConflictException('receipt_state_conflict');
  const now = clock();
  const resolvedAt = Date.parse(current.updatedAt);
  if (now > resolvedAt + BRANDED_GENERATION_DISPATCH_WINDOW_MS)
    throw new ConflictException('receipt_dispatch_window_expired');
  const claimedAt = Date.parse(input.dispatchClaimedAt);
  const acceptedAt = Date.parse(input.providerAcceptedAt);
  if (
    !(resolvedAt <= claimedAt && claimedAt <= acceptedAt && acceptedAt <= now)
  )
    throw new BadRequestException('receipt_dispatch_timing_invalid');
  const candidate = {
    ...current,
    state: 'dispatched' as const,
    execution: { ...input, result: 'pending' as const },
    budget: { ...current.budget, generationAttemptsUsed: 1 as const },
  };
  if (!brandedGenerationReceiptV1Schema.safeParse(candidate).success)
    throw new ConflictException('receipt_state_conflict');
  return candidate;
}

const BLOCK_REASON_MESSAGES: Record<BrandedGenerationBlockReasonV1, string> = {
  provider_attempt_ref_unavailable: 'Provider attempt reference unavailable',
  provider_submission_failed: 'Provider did not accept the generation',
};

export function projectBrandedGenerationBlockV1(
  current: BrandedGenerationReceiptV1,
  reasonCode: BrandedGenerationBlockReasonV1,
): BrandedGenerationReceiptV1 {
  if (current.state !== 'resolved')
    throw new ConflictException('receipt_state_conflict');
  return {
    ...current,
    state: 'blocked',
    diagnostics: withDiagnostic(current.diagnostics, {
      code: reasonCode,
      severity: 'error',
      message: BLOCK_REASON_MESSAGES[reasonCode],
    }),
  };
}

/**
 * The provider completed, but its output could not be fingerprinted for the
 * receipt (for example it exceeds the bounded material read). The execution
 * is recorded as completed and the receipt blocks without an artifact claim.
 */
export function projectBrandedGenerationUnboundCompletionV1(
  current: BrandedGenerationReceiptV1,
  input: BrandedGenerationFailureInputV1,
): BrandedGenerationReceiptV1 {
  if (
    current.state !== 'dispatched' ||
    !current.execution ||
    !canTransitionBrandedGenerationStateV1(current.state, 'blocked', 'block')
  )
    throw new ConflictException('receipt_state_conflict');
  const candidate = {
    ...current,
    state: 'blocked' as const,
    execution: {
      ...current.execution,
      result: 'completed' as const,
      completedAt: input.completedAt,
    },
    diagnostics: withDiagnostic(current.diagnostics, {
      code: input.reasonCode,
      severity: 'error',
      message: 'Output completed but could not be bound to the receipt',
    }),
  };
  if (!brandedGenerationReceiptV1Schema.safeParse(candidate).success)
    throw new ConflictException('receipt_state_conflict');
  return candidate;
}

/** Replaces cost lines by id; every other receipt field is unchanged. */
export function projectBrandedGenerationCostsV1(
  current: BrandedGenerationReceiptV1,
  costs: BrandedGenerationReceiptV1['costs'],
): BrandedGenerationReceiptV1 {
  const replaced = new Set(costs.map((cost) => cost.id));
  const candidate = {
    ...current,
    costs: [
      ...current.costs.filter((cost) => !replaced.has(cost.id)),
      ...costs,
    ],
  };
  if (!brandedGenerationReceiptV1Schema.safeParse(candidate).success)
    throw new BadRequestException('receipt_costs_invalid');
  return candidate;
}

export function projectBrandedGenerationFailureV1(
  current: BrandedGenerationReceiptV1,
  input: BrandedGenerationFailureInputV1,
): BrandedGenerationReceiptV1 {
  if (
    !canTransitionBrandedGenerationStateV1(current.state, 'failed', 'fail') ||
    !current.execution
  )
    throw new ConflictException('receipt_state_conflict');
  const candidate = {
    ...current,
    state: 'failed' as const,
    execution: {
      ...current.execution,
      result: 'failed' as const,
      completedAt: input.completedAt,
    },
    diagnostics: withDiagnostic(current.diagnostics, {
      code: input.reasonCode,
      severity: 'error',
      message: 'Generation failed',
    }),
  };
  if (!brandedGenerationReceiptV1Schema.safeParse(candidate).success)
    throw new ConflictException('receipt_state_conflict');
  return candidate;
}

export function projectBrandedGenerationValidationV1(
  current: BrandedGenerationReceiptV1,
  kind: 'validate' | 'revalidate',
  report: BrandArtifactValidationReportV1 | null,
): BrandedGenerationReceiptV1 {
  if (
    !(
      kind === 'validate'
        ? ['checking']
        : ['checking', 'ready', 'needs_review', 'blocked']
    ).includes(current.state)
  )
    throw new ConflictException('receipt_state_conflict');
  if (!current.artifact || current.execution?.result !== 'completed')
    throw new ConflictException('receipt_state_conflict');
  if (current.mode === 'raw' && report !== null)
    throw new BadRequestException('receipt_validation_binding_mismatch');
  if (current.mode !== 'raw' && current.snapshot === null)
    throw new ConflictException('receipt_state_conflict');
  if (
    report !== null &&
    (report.artifactId !== current.artifact.id ||
      report.artifactVersion !== current.artifact.version ||
      report.artifactHash !== current.artifact.contentHash ||
      report.snapshotHash !== current.snapshot?.contentHash)
  )
    throw new BadRequestException('receipt_validation_binding_mismatch');
  let result: ReturnType<typeof classifyBrandedGenerationReadinessV1>;
  try {
    result = classifyBrandedGenerationReadinessV1({
      receipt: current,
      validation: report,
    });
  } catch (error) {
    if (error instanceof TypeError)
      throw new ConflictException('receipt_state_conflict');
    throw error;
  }
  if (!canTransitionBrandedGenerationStateV1(current.state, result.state, kind))
    throw new ConflictException('receipt_state_conflict');
  const candidate = { ...current, ...result, validation: report };
  if (!brandedGenerationReceiptV1Schema.safeParse(candidate).success)
    throw new ConflictException('receipt_state_conflict');
  return candidate;
}

export function projectBrandedGenerationExpiredDispatchV1(
  current: BrandedGenerationReceiptV1,
  cutoff: Date,
): BrandedGenerationReceiptV1 {
  if (
    current.state !== 'resolved' ||
    Date.parse(current.updatedAt) > cutoff.getTime()
  )
    throw new ConflictException('receipt_state_conflict');
  return {
    ...current,
    state: 'blocked',
    diagnostics: withDiagnostic(current.diagnostics, {
      code: 'dispatch_window_expired',
      severity: 'error',
      message: 'Dispatch window expired',
    }),
  };
}

export function validateBrandedGenerationArtifactV1(
  input: BrandedGenerationArtifactCompletionV1,
): BrandGenerationArtifactV1 {
  const parsed = brandGenerationArtifactV1Schema.safeParse(input.artifact);
  if (!parsed.success)
    throw new BadRequestException('receipt_artifact_invalid');
  const artifact = parsed.data;
  try {
    if (
      hashBrandedGenerationArtifactManifestV1({
        mediaKind: artifact.mediaKind,
        textHash: input.textHash,
        parts: artifact.parts,
      }) !== artifact.contentHash ||
      (artifact.kind === 'post'
        ? artifact.mediaKind !== 'text' ||
          artifact.parts.length !== 0 ||
          input.textHash !== artifact.version
        : artifact.kind !== 'ingredient' ||
          !['image', 'video'].includes(artifact.mediaKind) ||
          input.textHash !== null ||
          artifact.parts.length !== 1 ||
          artifact.version !== artifact.parts[0].version ||
          artifact.parts[0].role !== artifact.mediaKind)
    )
      throw new Error('Invalid artifact');
  } catch {
    throw new BadRequestException('receipt_artifact_invalid');
  }
  return artifact;
}

export function buildBrandedGenerationDispatchOperationV1(
  input: BrandedGenerationDispatchInputV1,
): BrandedGenerationJsonV1 {
  return {
    provider: input.provider,
    model: input.model,
    ...(input.capabilityId !== undefined
      ? { capabilityId: input.capabilityId }
      : {}),
    ...(input.capabilityVersion !== undefined
      ? { capabilityVersion: input.capabilityVersion }
      : {}),
    providerAttemptRef: input.providerAttemptRef,
    dispatchClaimedAt: input.dispatchClaimedAt,
    providerAcceptedAt: input.providerAcceptedAt,
  };
}

export function assertBrandedGenerationArtifactBindingV1(
  current: BrandedGenerationReceiptV1,
): NonNullable<BrandedGenerationReceiptV1['execution']> {
  if (
    !canTransitionBrandedGenerationStateV1(
      current.state,
      'checking',
      'bind_artifact',
    ) ||
    !current.execution
  )
    throw new ConflictException('receipt_state_conflict');
  return current.execution;
}

export function projectBrandedGenerationArtifactBindingV1(
  current: BrandedGenerationReceiptV1,
  artifact: BrandGenerationArtifactV1,
  execution: NonNullable<BrandedGenerationReceiptV1['execution']>,
  completedAt: string,
): BrandedGenerationReceiptV1 {
  const candidate = {
    ...current,
    state: 'checking' as const,
    artifact,
    execution: {
      ...execution,
      result: 'completed' as const,
      completedAt,
    },
  };
  if (!brandedGenerationReceiptV1Schema.safeParse(candidate).success)
    throw new ConflictException('receipt_state_conflict');
  return candidate;
}

export function assertBrandedGenerationResolutionV1(
  actor: BrandedGenerationActorV1,
  current: BrandedGenerationReceiptV1,
  resolution: BrandedGenerationResolutionV1,
  retainedInput: BrandedGenerationInputV1 | undefined,
): void {
  if (
    retainedInput &&
    (retainedInput.actorId !== current.actorId ||
      retainedInput.organizationId !== current.organizationId ||
      retainedInput.brandId !== current.brandId ||
      retainedInput.requestKey !== current.requestKey ||
      retainedInput.candidateIndex !== current.candidateIndex ||
      hashBrandedGenerationRequestV1(retainedInput) !== current.requestHash ||
      hashBrandedGenerationTextV1(retainedInput.originalPrompt) !==
        current.prompts.original.contentHash ||
      ['parentRequestId', 'runId', 'workflowExecutionId', 'generationId'].some(
        (field) =>
          Reflect.get(retainedInput, field) !== Reflect.get(current, field),
      ))
  )
    throw new ConflictException('request_payload_conflict');
  if (
    current.mode !== resolution.mode ||
    (resolution.snapshot &&
      (resolution.snapshot.organizationId !== actor.organizationId ||
        resolution.snapshot.brandId !== actor.brandId))
  )
    throw new BadRequestException('receipt_resolution_scope_mismatch');
  if (
    resolution.status === 'resolved' &&
    resolution.originalPromptHash !== current.prompts.original.contentHash
  )
    throw new ConflictException('request_payload_conflict');
}

export function projectBrandedGenerationCancellationV1(
  current: BrandedGenerationReceiptV1,
): BrandedGenerationReceiptV1 {
  if (
    !canTransitionBrandedGenerationStateV1(current.state, 'cancelled', 'cancel')
  )
    throw new ConflictException('receipt_state_conflict');
  return { ...current, state: 'cancelled' };
}
