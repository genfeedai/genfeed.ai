import type { ExecutableNode, NodeExecutionResult } from '../types';
import {
  DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
  type EvaluateVideoPilotFn,
  VIDEO_GENERATION_NODE_TYPES,
  type VideoGenerationAcceptance,
  type VideoGenerationAttemptParameters,
  type VideoGenerationCreditMetadata,
  type VideoGenerationFailureSummary,
  type VideoGenerationGateConfig,
  type VideoGenerationLineage,
  type VideoGenerationLineageAttempt,
  type VideoQaAcceptanceReport,
} from '../video-generation-lineage';

export type VideoGenerationGateExecuteParams = {
  node: ExecutableNode;
  inputs: Map<string, unknown>;
  executor: (
    node: ExecutableNode,
    inputs: Map<string, unknown>,
  ) => Promise<unknown>;
  baseCreditCost: number;
  gateConfig: VideoGenerationGateConfig;
  lineage: VideoGenerationLineage;
  startedAt: Date;
  nodeId: string;
  workflowId: string;
  videoPilotAcceptance?: VideoGenerationAcceptance;
  evaluateVideoPilot?: EvaluateVideoPilotFn;
};

export type VideoGenerationGateExecuteResult =
  | { kind: 'bypass' }
  | { kind: 'result'; result: NodeExecutionResult };

export const VIDEO_GENERATION_GATE_HALT_PREFIX =
  'VIDEO_GENERATION_GATE_HALTED:';

export function isVideoGenerationNodeType(nodeType: string): boolean {
  return (VIDEO_GENERATION_NODE_TYPES as readonly string[]).includes(nodeType);
}

export function resolveRequestedDurationSeconds(
  node: ExecutableNode,
  inputs?: Map<string, unknown>,
): number {
  const fromConfig = readPositiveNumber(node.config.duration);
  if (fromConfig !== null) {
    return fromConfig;
  }

  const fromInputs = inputs ? readPositiveNumber(inputs.get('duration')) : null;
  if (fromInputs !== null) {
    return fromInputs;
  }

  return DEFAULT_VIDEO_GENERATION_GATE_CONFIG.referenceDurationSeconds;
}

export function shouldApplyVideoGenerationGate(input: {
  node: ExecutableNode;
  config: VideoGenerationGateConfig;
  baseCreditCost: number;
  inputs?: Map<string, unknown>;
}): boolean {
  if (!input.config.isEnabled) {
    return false;
  }

  if (!isVideoGenerationNodeType(input.node.type)) {
    return false;
  }

  const requestedDuration = resolveRequestedDurationSeconds(
    input.node,
    input.inputs,
  );

  if (requestedDuration <= input.config.minBillableDurationSeconds) {
    return false;
  }

  const isDurationGated =
    requestedDuration >= input.config.durationThresholdSeconds;
  const isCreditGated = input.baseCreditCost >= input.config.creditThreshold;

  return isDurationGated || isCreditGated;
}

/**
 * Pilot runs reuse the canonical `videoGen` action cost. There is no
 * `videoPilot` key in `DEFAULT_CREDIT_COSTS` — charge is `base * duration / reference`.
 */
export function scaleVideoGenerationCredits(
  baseCreditCost: number,
  durationSeconds: number,
  referenceDurationSeconds: number,
): number {
  if (baseCreditCost <= 0 || referenceDurationSeconds <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.round((baseCreditCost * durationSeconds) / referenceDurationSeconds),
  );
}

export function createPilotExecutableNode(
  node: ExecutableNode,
  durationSeconds: number,
): ExecutableNode {
  return {
    ...node,
    config: {
      ...node.config,
      duration: durationSeconds,
    },
  };
}

export function isVideoQaAcceptanceReport(
  value: unknown,
): value is VideoQaAcceptanceReport {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.passed === 'boolean';
}

export function findVideoQaAcceptanceReport(
  inputs: Map<string, unknown>,
  output: unknown,
): VideoQaAcceptanceReport | null {
  if (isVideoQaAcceptanceReport(output)) {
    return output;
  }

  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const nested = (output as Record<string, unknown>).report;
    if (isVideoQaAcceptanceReport(nested)) {
      return nested;
    }
  }

  for (const value of inputs.values()) {
    if (isVideoQaAcceptanceReport(value)) {
      return value;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = (value as Record<string, unknown>).report;
      if (isVideoQaAcceptanceReport(nested)) {
        return nested;
      }
    }
  }

  return null;
}

export function resolveVideoGenerationAcceptance(input: {
  inputs: Map<string, unknown>;
  output: unknown;
  videoPilotAcceptance?: VideoGenerationAcceptance;
}): VideoGenerationAcceptance | null {
  if (input.videoPilotAcceptance) {
    return input.videoPilotAcceptance;
  }

  const report = findVideoQaAcceptanceReport(input.inputs, input.output);
  if (!report) {
    return null;
  }

  return {
    failures: report.failures,
    passed: report.passed,
    source: 'videoQa',
  };
}

export function createVideoGenerationLineage(input: {
  lineageId: string;
  nodeId: string;
  workflowId: string;
}): VideoGenerationLineage {
  return {
    attempts: [],
    isAwaitingAcceptance: false,
    lineageId: input.lineageId,
    nodeId: input.nodeId,
    workflowId: input.workflowId,
  };
}

export function appendVideoGenerationAttempt(
  lineage: VideoGenerationLineage,
  attempt: VideoGenerationLineageAttempt,
): VideoGenerationLineage {
  return {
    ...lineage,
    attempts: [...lineage.attempts, attempt],
  };
}

export function countRejectedPaidCandidates(
  lineage: VideoGenerationLineage,
): number {
  return lineage.attempts.filter((attempt) => attempt.accepted === false)
    .length;
}

export function hasReachedPaidRetryCeiling(
  lineage: VideoGenerationLineage,
  paidRetryCeiling: number,
): boolean {
  return countRejectedPaidCandidates(lineage) >= paidRetryCeiling;
}

export function buildVideoGenerationFailureSummary(
  lineage: VideoGenerationLineage,
  paidRetryCeiling: number,
): VideoGenerationFailureSummary {
  const rejected = lineage.attempts.filter(
    (attempt) => attempt.accepted === false,
  );
  const reasons = rejected
    .map((attempt) => attempt.rejectionReason)
    .filter((reason): reason is string => Boolean(reason));
  const recurringFailure =
    mostCommonReason(reasons) ??
    'The same video generation configuration failed quality review.';

  return {
    attempts: lineage.attempts,
    lineageId: lineage.lineageId,
    nodeId: lineage.nodeId,
    paidCandidateCount: rejected.length,
    paidRetryCeiling,
    recurringFailure,
  };
}

export function formatVideoGenerationHaltError(
  summary: VideoGenerationFailureSummary,
): string {
  return `${VIDEO_GENERATION_GATE_HALT_PREFIX}${JSON.stringify(summary)}`;
}

export function parseVideoGenerationHaltError(
  error: string,
): VideoGenerationFailureSummary | null {
  if (!error.startsWith(VIDEO_GENERATION_GATE_HALT_PREFIX)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(
      error.slice(VIDEO_GENERATION_GATE_HALT_PREFIX.length),
    );
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('lineageId' in parsed)
    ) {
      return null;
    }
    return parsed as VideoGenerationFailureSummary;
  } catch {
    return null;
  }
}

export function readVideoGenerationAttemptParameters(
  node: ExecutableNode,
  durationSeconds: number,
): VideoGenerationAttemptParameters {
  return {
    aspectRatio: readOptionalString(node.config.aspectRatio),
    durationSeconds,
    model: readOptionalString(node.config.model),
    prompt: readOptionalString(node.config.prompt ?? node.config.inputPrompt),
    resolution: readOptionalString(node.config.resolution),
    seed: readOptionalNumber(node.config.seed),
  };
}

export function toVideoGenerationCreditMetadata(
  lineage: VideoGenerationLineage,
  attempt: VideoGenerationLineageAttempt,
): VideoGenerationCreditMetadata {
  return {
    accepted: attempt.accepted,
    attemptKind: attempt.attemptKind,
    attemptNumber: attempt.attemptNumber,
    lineageId: lineage.lineageId,
  };
}

function readPositiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function mostCommonReason(reasons: string[]): string | undefined {
  if (reasons.length === 0) {
    return undefined;
  }

  const counts = new Map<string, number>();
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  let winner = reasons[0];
  let max = 0;
  for (const [reason, count] of counts) {
    if (count > max) {
      winner = reason;
      max = count;
    }
  }
  return winner;
}

function nextAttemptNumber(lineage: VideoGenerationLineage): number {
  if (lineage.attempts.length === 0) {
    return 1;
  }
  return (
    Math.max(...lineage.attempts.map((attempt) => attempt.attemptNumber)) + 1
  );
}

function rejectionReasonFromAcceptance(
  acceptance: VideoGenerationAcceptance,
): string {
  const codes = (acceptance.failures ?? [])
    .map((failure) => failure.code)
    .filter((code) => code.length > 0);
  if (codes.length > 0) {
    return codes.join(',');
  }
  return acceptance.source === 'userReview'
    ? 'user_rejected'
    : 'video_qa_failed';
}

export class VideoGenerationGateService {
  async execute(
    params: VideoGenerationGateExecuteParams,
  ): Promise<VideoGenerationGateExecuteResult> {
    if (
      !shouldApplyVideoGenerationGate({
        baseCreditCost: params.baseCreditCost,
        config: params.gateConfig,
        inputs: params.inputs,
        node: params.node,
      })
    ) {
      return { kind: 'bypass' };
    }

    const lineage = params.lineage;

    if (
      hasReachedPaidRetryCeiling(lineage, params.gateConfig.paidRetryCeiling)
    ) {
      return {
        kind: 'result',
        result: this.haltResult(params, lineage),
      };
    }

    const requestedDuration = resolveRequestedDurationSeconds(
      params.node,
      params.inputs,
    );
    const hasAcceptedPilot = lineage.attempts.some(
      (attempt) => attempt.attemptKind === 'pilot' && attempt.accepted === true,
    );
    const hasPendingPilot = lineage.attempts.some(
      (attempt) => attempt.attemptKind === 'pilot' && attempt.accepted === null,
    );

    if (
      params.videoPilotAcceptance?.passed === true &&
      (hasAcceptedPilot || hasPendingPilot)
    ) {
      return {
        kind: 'result',
        result: await this.runFullAttempt(params, lineage, requestedDuration),
      };
    }

    return {
      kind: 'result',
      result: await this.runPilotAttempt(params, lineage, requestedDuration),
    };
  }

  private haltResult(
    params: VideoGenerationGateExecuteParams,
    lineage: VideoGenerationLineage,
  ): NodeExecutionResult {
    const summary = buildVideoGenerationFailureSummary(
      lineage,
      params.gateConfig.paidRetryCeiling,
    );

    return {
      completedAt: new Date(),
      creditsUsed: 0,
      error: formatVideoGenerationHaltError(summary),
      nodeId: params.nodeId,
      retryCount: 0,
      startedAt: params.startedAt,
      status: 'failed',
      videoGenerationLineage: {
        ...lineage,
        isAwaitingAcceptance: false,
      },
    };
  }

  private async runPilotAttempt(
    params: VideoGenerationGateExecuteParams,
    lineage: VideoGenerationLineage,
    requestedDuration: number,
  ): Promise<NodeExecutionResult> {
    const pilotDuration = params.gateConfig.minBillableDurationSeconds;
    const creditsCharged = scaleVideoGenerationCredits(
      params.baseCreditCost,
      pilotDuration,
      params.gateConfig.referenceDurationSeconds,
    );
    const pilotNode = createPilotExecutableNode(params.node, pilotDuration);

    let output: unknown;
    try {
      output = await params.executor(pilotNode, params.inputs);
    } catch (error) {
      return {
        completedAt: new Date(),
        creditsUsed: 0,
        error: error instanceof Error ? error.message : String(error),
        nodeId: params.nodeId,
        retryCount: 0,
        startedAt: params.startedAt,
        status: 'failed',
        videoGenerationLineage: lineage,
      };
    }

    const evaluated =
      (params.evaluateVideoPilot
        ? await params.evaluateVideoPilot(output)
        : null) ??
      resolveVideoGenerationAcceptance({
        inputs: params.inputs,
        output,
        videoPilotAcceptance: params.videoPilotAcceptance,
      });

    const attemptNumber = nextAttemptNumber(lineage);

    if (evaluated && !evaluated.passed) {
      const rejectedLineage = appendVideoGenerationAttempt(lineage, {
        accepted: false,
        attemptKind: 'pilot',
        attemptNumber,
        creditsCharged,
        durationSeconds: pilotDuration,
        parameters: readVideoGenerationAttemptParameters(
          params.node,
          pilotDuration,
        ),
        rejectionReason: rejectionReasonFromAcceptance(evaluated),
      });

      if (
        hasReachedPaidRetryCeiling(
          rejectedLineage,
          params.gateConfig.paidRetryCeiling,
        )
      ) {
        return {
          ...this.haltResult(params, rejectedLineage),
          creditsUsed: creditsCharged,
          output,
        };
      }

      return {
        completedAt: new Date(),
        creditsUsed: creditsCharged,
        error: `Video pilot rejected (${evaluated.source})`,
        nodeId: params.nodeId,
        output,
        retryCount: 0,
        startedAt: params.startedAt,
        status: 'failed',
        videoGenerationLineage: {
          ...rejectedLineage,
          isAwaitingAcceptance: false,
        },
      };
    }

    if (evaluated?.passed === true) {
      const acceptedPilot = appendVideoGenerationAttempt(lineage, {
        accepted: true,
        attemptKind: 'pilot',
        attemptNumber,
        creditsCharged,
        durationSeconds: pilotDuration,
        parameters: readVideoGenerationAttemptParameters(
          params.node,
          pilotDuration,
        ),
      });

      const fullResult = await this.runFullAttempt(
        params,
        acceptedPilot,
        requestedDuration,
      );

      return {
        ...fullResult,
        creditsUsed: creditsCharged + fullResult.creditsUsed,
      };
    }

    const awaitingLineage = appendVideoGenerationAttempt(lineage, {
      accepted: null,
      attemptKind: 'pilot',
      attemptNumber,
      creditsCharged,
      durationSeconds: pilotDuration,
      parameters: readVideoGenerationAttemptParameters(
        params.node,
        pilotDuration,
      ),
    });

    return {
      completedAt: new Date(),
      creditsUsed: creditsCharged,
      nodeId: params.nodeId,
      output,
      retryCount: 0,
      startedAt: params.startedAt,
      status: 'completed',
      videoGenerationLineage: {
        ...awaitingLineage,
        isAwaitingAcceptance: true,
      },
    };
  }

  private async runFullAttempt(
    params: VideoGenerationGateExecuteParams,
    lineage: VideoGenerationLineage,
    requestedDuration: number,
  ): Promise<NodeExecutionResult> {
    const creditsCharged = scaleVideoGenerationCredits(
      params.baseCreditCost,
      requestedDuration,
      params.gateConfig.referenceDurationSeconds,
    );

    const pendingPilotIndex = lineage.attempts.findIndex(
      (attempt) => attempt.attemptKind === 'pilot' && attempt.accepted === null,
    );
    let nextLineage = lineage;
    if (pendingPilotIndex >= 0) {
      nextLineage = {
        ...lineage,
        attempts: lineage.attempts.map((attempt, index) =>
          index === pendingPilotIndex
            ? { ...attempt, accepted: true }
            : attempt,
        ),
        isAwaitingAcceptance: false,
      };
    }

    let output: unknown;
    try {
      output = await params.executor(params.node, params.inputs);
    } catch (error) {
      return {
        completedAt: new Date(),
        creditsUsed: 0,
        error: error instanceof Error ? error.message : String(error),
        nodeId: params.nodeId,
        retryCount: 0,
        startedAt: params.startedAt,
        status: 'failed',
        videoGenerationLineage: nextLineage,
      };
    }

    const completedLineage = appendVideoGenerationAttempt(nextLineage, {
      accepted: true,
      attemptKind: 'full',
      attemptNumber: nextAttemptNumber(nextLineage),
      creditsCharged,
      durationSeconds: requestedDuration,
      parameters: readVideoGenerationAttemptParameters(
        params.node,
        requestedDuration,
      ),
    });

    return {
      completedAt: new Date(),
      creditsUsed: creditsCharged,
      nodeId: params.nodeId,
      output,
      retryCount: 0,
      startedAt: params.startedAt,
      status: 'completed',
      videoGenerationLineage: {
        ...completedLineage,
        isAwaitingAcceptance: false,
      },
    };
  }
}
