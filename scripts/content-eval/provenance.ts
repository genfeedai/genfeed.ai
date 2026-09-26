/**
 * Provenance helpers: digests, source revision, and the one place a dispatcher
 * call is metered and recorded (reserve → dispatch → charge).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type {
  EvalStructuredRequest,
  MeteredCallContext,
  MeteredCallResult,
  SourceRevision,
} from './contracts';
import { callProvenanceSchema } from './contracts';
import { requireModelFamily } from './families';
import {
  catalogueCostUsd,
  estimateTokens,
  reservationCostUsd,
  UnmeteredCallError,
  usdToCredits,
} from './spend';

export function sha256Digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Stable JSON: object keys sorted, so a digest never depends on key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
    }

    return entry;
  });
}

export function readSourceRevision(): SourceRevision {
  return {
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    workingTreeDirty:
      execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim().length > 0,
  };
}

/**
 * Reserve the worst case, dispatch, then charge what the call actually cost.
 * A call whose cost can be neither read from the provider nor priced from the
 * catalogue fails closed — an unmetered call would make the cap a fiction.
 */
export async function meteredCall<TResult>(
  context: MeteredCallContext,
  request: EvalStructuredRequest<TResult>,
): Promise<MeteredCallResult<TResult>> {
  const promptText = canonicalJson(request.messages);
  context.ledger.reserve(
    usdToCredits(
      reservationCostUsd(
        request.model,
        estimateTokens(promptText),
        request.maxTokens,
      ),
    ),
  );

  const response = await context.dispatcher.completeStructured(request);
  const reportedUsd = response.usage.costUsd;
  const costUsd =
    reportedUsd ??
    catalogueCostUsd(
      request.model,
      response.usage.promptTokens,
      response.usage.completionTokens,
    );
  if (costUsd === null) {
    throw new UnmeteredCallError(request.model);
  }

  // Suites dispatch sequentially, so the ledger position is a stable id.
  const callNumber = context.ledger.calls.length + 1;
  const credits = usdToCredits(costUsd);
  const provenance = callProvenanceSchema.parse({
    callId: `call-${callNumber}-${request.role}`,
    completionTokens: response.usage.completionTokens,
    costEvidence: reportedUsd === null ? 'catalogue' : 'reported',
    costUsd,
    credits,
    family: requireModelFamily(request.model),
    kind: request.role,
    latencyMs: response.latencyMs,
    model: request.model,
    modelVersion: response.modelVersion,
    promptDigest: sha256Digest(promptText),
    promptTokens: response.usage.promptTokens,
    provider: response.provider,
    rowId: context.rowId,
    rubricDigest: context.rubricDigest,
    rubricVersion: context.rubricVersion,
    seed: request.seed,
    settings: {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    },
  });
  context.ledger.charge({ credits, kind: request.role, provenance });

  return { provenance, response };
}
