/**
 * Provenance helpers: digests, source revision, and the one place a dispatcher
 * call is metered and recorded (reserve → dispatch → charge).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ZodType } from 'zod';
import { z } from 'zod';
import type {
  CallProvenance,
  CallProvenanceInput,
  ChargeableUsage,
  EvalStructuredRequest,
  EvalStructuredResponse,
  EvalUsage,
  MeteredCallContext,
  MeteredCallResult,
  SourceRevision,
} from './contracts';
import { callProvenanceSchema } from './contracts';
import { requireModelFamily } from './families';
import {
  catalogueCostUsd,
  EvalDispatchError,
  reservationCostUsd,
  upperBoundTokens,
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
        // Code-point order: locale-aware comparison would make digests
        // depend on the machine's locale.
        Object.entries(entry).sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      );
    }

    return entry;
  });
}

export function readRepoRoot(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
}

/** CLI paths are repo-root-relative, whatever directory the run starts in. */
export function resolveRepoPath(path: string): string {
  return isAbsolute(path) ? path : resolve(readRepoRoot(), path);
}

/**
 * Paths written into a report never carry a machine's home directory: files
 * outside the repository are reported by name only.
 */
export function toRepoRelativePath(path: string): string {
  const absolutePath = resolveRepoPath(path);
  const relativePath = relative(readRepoRoot(), absolutePath);
  const isOutside =
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath);
  return isOutside ? `external:${basename(absolutePath)}` : relativePath;
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
 * Thrown by `meteredCall` when a dispatch fails. The failed call has already
 * been charged; `provenance` lets the caller link the void row to its cost.
 */
export class MeteredCallError extends Error {
  constructor(
    readonly provenance: CallProvenance,
    options: { cause: unknown },
  ) {
    super(
      options.cause instanceof Error
        ? options.cause.message
        : String(options.cause),
      options,
    );
    this.name = 'MeteredCallError';
  }
}

/**
 * What a finished or failed call is charged. Metering fails closed: when the
 * provider reported no cost and the catalogue cannot price the tokens — or no
 * usage came back at all — the worst-case reservation is charged instead.
 */
export function chargeableUsage(
  model: string,
  usage: EvalUsage | null,
  reservedUsd: number,
): ChargeableUsage {
  if (usage?.costUsd !== null && usage?.costUsd !== undefined) {
    return { costEvidence: 'reported', costUsd: usage.costUsd };
  }
  if (!usage || usage.promptTokens + usage.completionTokens === 0) {
    return { costEvidence: 'reservation', costUsd: reservedUsd };
  }

  const catalogue = catalogueCostUsd(
    model,
    usage.promptTokens,
    usage.completionTokens,
  );
  return catalogue === null
    ? { costEvidence: 'reservation', costUsd: reservedUsd }
    : { costEvidence: 'catalogue', costUsd: catalogue };
}

function schemaText(schema: ZodType): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema));
  } catch {
    return '';
  }
}

/**
 * Reserve the worst case (repair retry and response-format schema included),
 * dispatch, then charge what the call cost — on failure too, since a provider
 * bills a call that later fails schema validation or times out.
 */
export async function meteredCall<TResult>(
  context: MeteredCallContext,
  request: EvalStructuredRequest<TResult>,
): Promise<MeteredCallResult<TResult>> {
  const promptText = canonicalJson(request.messages);
  const reservedUsd = reservationCostUsd(
    request.model,
    upperBoundTokens(promptText + schemaText(request.schema)),
    request.maxTokens,
  );
  context.ledger.reserve(usdToCredits(reservedUsd));

  const charge = (
    usage: EvalUsage | null,
    fields: Pick<
      CallProvenanceInput,
      'isFailed' | 'latencyMs' | 'modelVersion' | 'provider'
    >,
  ): CallProvenance => {
    const { costEvidence, costUsd } = chargeableUsage(
      request.model,
      usage,
      reservedUsd,
    );
    // Suites dispatch sequentially, so the ledger position is a stable id.
    const callNumber = context.ledger.calls.length + 1;
    const credits = usdToCredits(costUsd);
    const provenance = callProvenanceSchema.parse({
      ...fields,
      callId: `call-${callNumber}-${request.role}`,
      completionTokens: usage?.completionTokens ?? 0,
      costEvidence,
      costUsd,
      credits,
      family: requireModelFamily(request.model),
      kind: request.role,
      model: request.model,
      promptDigest: sha256Digest(promptText),
      promptTokens: usage?.promptTokens ?? 0,
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
    return provenance;
  };

  let response: EvalStructuredResponse<TResult>;
  try {
    response = await context.dispatcher.completeStructured(request);
  } catch (error: unknown) {
    const failure = error instanceof EvalDispatchError ? error : null;
    // A charge that crosses the cap throws SpendCapExceededError from here,
    // which outranks the dispatch failure.
    const provenance = charge(failure?.usage ?? null, {
      isFailed: true,
      latencyMs: failure?.latencyMs ?? 0,
      modelVersion: request.model,
      provider: failure?.provider || 'unknown',
    });
    throw new MeteredCallError(provenance, { cause: error });
  }

  const provenance = charge(response.usage, {
    isFailed: false,
    latencyMs: response.latencyMs,
    modelVersion: response.modelVersion || request.model,
    provider: response.provider || 'unknown',
  });

  return { provenance, response };
}
