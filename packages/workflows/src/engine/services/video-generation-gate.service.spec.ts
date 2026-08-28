import { describe, expect, it, vi } from 'vitest';
import type { ExecutableNode } from '../types';
import { DEFAULT_CREDIT_COSTS } from '../utils/credit-calculator';
import {
  DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
  type VideoGenerationGateConfig,
  type VideoGenerationLineage,
} from '../video-generation-lineage';
import {
  appendVideoGenerationAttempt,
  buildVideoGenerationFailureSummary,
  countRejectedPaidCandidates,
  createPilotExecutableNode,
  createVideoGenerationLineage,
  findVideoQaAcceptanceReport,
  formatVideoGenerationHaltError,
  hasReachedPaidRetryCeiling,
  isVideoGenerationNodeType,
  isVideoQaAcceptanceReport,
  parseVideoGenerationHaltError,
  resolveRequestedDurationSeconds,
  resolveVideoGenerationAcceptance,
  scaleVideoGenerationCredits,
  shouldApplyVideoGenerationGate,
  VIDEO_GENERATION_GATE_HALT_PREFIX,
  VideoGenerationGateService,
} from './video-generation-gate.service';

function makeNode(
  type: string,
  config: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config,
    id: 'video-1',
    inputs: [],
    label: 'Video',
    type,
  };
}

function makeLineage(
  overrides: Partial<VideoGenerationLineage> = {},
): VideoGenerationLineage {
  return {
    attempts: [],
    isAwaitingAcceptance: false,
    lineageId: 'lineage-1',
    nodeId: 'video-1',
    workflowId: 'wf-1',
    ...overrides,
  };
}

const disabledConfig: VideoGenerationGateConfig = {
  ...DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
  isEnabled: false,
};

describe('isVideoGenerationNodeType', () => {
  it('matches only the canonical video generation action', () => {
    expect(isVideoGenerationNodeType('videoGen')).toBe(true);
  });

  it('does not match image, processing, or other node types', () => {
    expect(isVideoGenerationNodeType('imageGen')).toBe(false);
    expect(isVideoGenerationNodeType('generateVideo')).toBe(false);
    expect(isVideoGenerationNodeType('video-generator')).toBe(false);
    expect(isVideoGenerationNodeType('lipSync')).toBe(false);
    expect(isVideoGenerationNodeType('reframe')).toBe(false);
    expect(isVideoGenerationNodeType('upscale')).toBe(false);
    expect(isVideoGenerationNodeType('generate')).toBe(false);
  });
});

describe('shouldApplyVideoGenerationGate', () => {
  it('returns false when the gate is disabled', () => {
    expect(
      shouldApplyVideoGenerationGate({
        baseCreditCost: 10,
        config: disabledConfig,
        node: makeNode('videoGen', { duration: 8 }),
      }),
    ).toBe(false);
  });

  it('returns false for non-video node types even when enabled', () => {
    expect(
      shouldApplyVideoGenerationGate({
        baseCreditCost: 10,
        config: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
        node: makeNode('imageGen', { duration: 8 }),
      }),
    ).toBe(false);
  });

  it('returns false when requested duration is already the provider minimum', () => {
    expect(
      shouldApplyVideoGenerationGate({
        baseCreditCost: 10,
        config: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
        node: makeNode('videoGen', { duration: 4 }),
      }),
    ).toBe(false);
  });

  it('returns false when duration and credit cost are both below their thresholds', () => {
    expect(
      shouldApplyVideoGenerationGate({
        baseCreditCost: 5,
        config: {
          ...DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
          creditThreshold: 10,
          durationThresholdSeconds: 8,
        },
        node: makeNode('videoGen', { duration: 6 }),
      }),
    ).toBe(false);
  });

  it('returns true when credit cost is at/above the threshold even if duration is short', () => {
    expect(
      shouldApplyVideoGenerationGate({
        baseCreditCost: 10,
        config: {
          ...DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
          durationThresholdSeconds: 8,
        },
        node: makeNode('videoGen', { duration: 6 }),
      }),
    ).toBe(true);
  });

  it('returns true when requested duration is at/above the threshold', () => {
    expect(
      shouldApplyVideoGenerationGate({
        baseCreditCost: 10,
        config: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
        node: makeNode('videoGen', { duration: 8 }),
      }),
    ).toBe(true);
  });

  it('returns true for BYOK (zero credit cost) when duration is above threshold', () => {
    expect(
      shouldApplyVideoGenerationGate({
        baseCreditCost: 0,
        config: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
        node: makeNode('videoGen', { duration: 8 }),
      }),
    ).toBe(true);
  });
});

describe('scaleVideoGenerationCredits', () => {
  it('does not add a distinct videoPilot cost key — scales the videoGen flat cost by duration', () => {
    expect('videoPilot' in DEFAULT_CREDIT_COSTS).toBe(false);
    expect(scaleVideoGenerationCredits(10, 4, 8)).toBe(5);
    expect(scaleVideoGenerationCredits(10, 8, 8)).toBe(10);
    expect(scaleVideoGenerationCredits(0, 4, 8)).toBe(0);
  });
});

describe('createPilotExecutableNode', () => {
  it('copies seed-stable params and only overrides duration', () => {
    const node = makeNode('videoGen', {
      aspectRatio: '16:9',
      duration: 8,
      model: 'veo-3.1-fast',
      prompt: 'a presenter walking',
      seed: 42,
    });

    const pilot = createPilotExecutableNode(node, 4);

    expect(pilot.config).toEqual({
      aspectRatio: '16:9',
      duration: 4,
      model: 'veo-3.1-fast',
      prompt: 'a presenter walking',
      seed: 42,
    });
    expect(pilot.id).toBe(node.id);
    expect(pilot.type).toBe('videoGen');
  });
});

describe('videoQa duck-type acceptance', () => {
  it('accepts a #3450-shaped report without importing VideoQaReport', () => {
    const report = {
      failures: [
        {
          code: 'BLACK_FRAMES',
          message: 'opening second is black',
          timestamp: 0.2,
        },
      ],
      passed: false,
    };

    expect(isVideoQaAcceptanceReport(report)).toBe(true);
    expect(
      findVideoQaAcceptanceReport(new Map([['qa', report]]), undefined),
    ).toEqual(report);
  });

  it('rejects non-reports', () => {
    expect(
      isVideoQaAcceptanceReport({ video: 'https://cdn.test/clip.mp4' }),
    ).toBe(false);
    expect(isVideoQaAcceptanceReport(null)).toBe(false);
  });
});

describe('resolveVideoGenerationAcceptance', () => {
  it('prefers an explicit user-review or QA acceptance', () => {
    const acceptance = resolveVideoGenerationAcceptance({
      inputs: new Map(),
      output: { passed: true },
      videoPilotAcceptance: {
        passed: true,
        source: 'userReview',
      },
    });

    expect(acceptance).toEqual({ passed: true, source: 'userReview' });
  });

  it('uses a duck-typed videoQa report from inputs when no explicit acceptance is set', () => {
    const acceptance = resolveVideoGenerationAcceptance({
      inputs: new Map([['report', { passed: true }]]),
      output: undefined,
    });

    expect(acceptance).toEqual({
      failures: undefined,
      passed: true,
      source: 'videoQa',
    });
  });

  it('returns null when nothing can decide yet (user-review fallback)', () => {
    expect(
      resolveVideoGenerationAcceptance({
        inputs: new Map(),
        output: { video: 'https://cdn.test/pilot.mp4' },
      }),
    ).toBeNull();
  });
});

describe('paid retry ceiling', () => {
  it('counts rejected paid candidates and halts at the default of 3', () => {
    const lineage = makeLineage({
      attempts: [
        {
          accepted: false,
          attemptKind: 'pilot',
          attemptNumber: 1,
          creditsCharged: 5,
          durationSeconds: 4,
          parameters: { durationSeconds: 4 },
          rejectionReason: 'BLACK_FRAMES',
        },
        {
          accepted: false,
          attemptKind: 'pilot',
          attemptNumber: 2,
          creditsCharged: 5,
          durationSeconds: 4,
          parameters: { durationSeconds: 4 },
          rejectionReason: 'FREEZE_FRAMES',
        },
        {
          accepted: false,
          attemptKind: 'pilot',
          attemptNumber: 3,
          creditsCharged: 5,
          durationSeconds: 4,
          parameters: { durationSeconds: 4 },
          rejectionReason: 'BLACK_FRAMES',
        },
      ],
    });

    expect(countRejectedPaidCandidates(lineage)).toBe(3);
    expect(hasReachedPaidRetryCeiling(lineage, 3)).toBe(true);

    const summary = buildVideoGenerationFailureSummary(lineage, 3);
    expect(summary.paidCandidateCount).toBe(3);
    expect(summary.attempts).toHaveLength(3);
    expect(summary.recurringFailure).toContain('BLACK_FRAMES');

    const error = formatVideoGenerationHaltError(summary);
    expect(error.startsWith(VIDEO_GENERATION_GATE_HALT_PREFIX)).toBe(true);
    expect(parseVideoGenerationHaltError(error)?.lineageId).toBe('lineage-1');
  });

  it('does not count pending or accepted attempts as rejections', () => {
    const lineage = makeLineage({
      attempts: [
        {
          accepted: null,
          attemptKind: 'pilot',
          attemptNumber: 1,
          creditsCharged: 5,
          durationSeconds: 4,
          parameters: { durationSeconds: 4 },
        },
        {
          accepted: true,
          attemptKind: 'full',
          attemptNumber: 2,
          creditsCharged: 10,
          durationSeconds: 8,
          parameters: { durationSeconds: 8 },
        },
      ],
    });

    expect(countRejectedPaidCandidates(lineage)).toBe(0);
    expect(hasReachedPaidRetryCeiling(lineage, 3)).toBe(false);
  });
});

describe('VideoGenerationGateService', () => {
  const service = new VideoGenerationGateService();

  it('bypasses when the gate is disabled so executeNode can keep the current path', async () => {
    const executor = vi.fn();
    const result = await service.execute({
      baseCreditCost: 10,
      executor,
      gateConfig: disabledConfig,
      inputs: new Map(),
      lineage: makeLineage(),
      node: makeNode('videoGen', { duration: 8 }),
      nodeId: 'video-1',
      startedAt: new Date(),
      workflowId: 'wf-1',
    });

    expect(result).toEqual({ kind: 'bypass' });
    expect(executor).not.toHaveBeenCalled();
  });

  it('bypasses when duration is at the provider minimum', async () => {
    const result = await service.execute({
      baseCreditCost: 10,
      executor: vi.fn(),
      gateConfig: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
      inputs: new Map(),
      lineage: makeLineage(),
      node: makeNode('videoGen', { duration: 4 }),
      nodeId: 'video-1',
      startedAt: new Date(),
      workflowId: 'wf-1',
    });

    expect(result.kind).toBe('bypass');
  });

  it('charges only the scaled pilot until a videoQa report accepts, then charges the full run', async () => {
    const executor = vi
      .fn()
      .mockResolvedValueOnce({ video: 'pilot.mp4' })
      .mockResolvedValueOnce({ video: 'full.mp4' });

    const result = await service.execute({
      baseCreditCost: 10,
      evaluateVideoPilot: async () => ({
        passed: true,
        source: 'videoQa',
      }),
      executor,
      gateConfig: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
      inputs: new Map(),
      lineage: makeLineage(),
      node: makeNode('videoGen', {
        duration: 8,
        model: 'veo-3.1-fast',
        prompt: 'a presenter walking',
        seed: 7,
      }),
      nodeId: 'video-1',
      startedAt: new Date(),
      workflowId: 'wf-1',
    });

    expect(result.kind).toBe('result');
    if (result.kind !== 'result') {
      return;
    }

    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor.mock.calls[0]?.[0].config.duration).toBe(4);
    expect(executor.mock.calls[1]?.[0].config.duration).toBe(8);
    expect(result.result.status).toBe('completed');
    expect(result.result.creditsUsed).toBe(15);
    expect(result.result.output).toEqual({ video: 'full.mp4' });
    expect(result.result.videoGenerationLineage?.attempts).toEqual([
      expect.objectContaining({
        accepted: true,
        attemptKind: 'pilot',
        creditsCharged: 5,
        durationSeconds: 4,
      }),
      expect.objectContaining({
        accepted: true,
        attemptKind: 'full',
        creditsCharged: 10,
        durationSeconds: 8,
      }),
    ]);
  });

  it('surfaces the pilot for user review and does not call the provider for the full run', async () => {
    const executor = vi.fn().mockResolvedValue({ video: 'pilot.mp4' });

    const result = await service.execute({
      baseCreditCost: 10,
      executor,
      gateConfig: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
      inputs: new Map(),
      lineage: makeLineage(),
      node: makeNode('videoGen', { duration: 8 }),
      nodeId: 'video-1',
      startedAt: new Date(),
      workflowId: 'wf-1',
    });

    expect(result.kind).toBe('result');
    if (result.kind !== 'result') {
      return;
    }

    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.result.status).toBe('completed');
    expect(result.result.creditsUsed).toBe(5);
    expect(result.result.output).toEqual({ video: 'pilot.mp4' });
    expect(result.result.videoGenerationLineage?.isAwaitingAcceptance).toBe(
      true,
    );
  });

  it('runs the full-length generation on a later acceptance without regenerating the pilot', async () => {
    const executor = vi.fn().mockResolvedValue({ video: 'full.mp4' });
    const lineage = appendVideoGenerationAttempt(makeLineage(), {
      accepted: null,
      attemptKind: 'pilot',
      attemptNumber: 1,
      creditsCharged: 5,
      durationSeconds: 4,
      parameters: { durationSeconds: 4, model: 'veo-3.1-fast' },
    });
    lineage.isAwaitingAcceptance = true;

    const result = await service.execute({
      baseCreditCost: 10,
      executor,
      gateConfig: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
      inputs: new Map(),
      lineage,
      node: makeNode('videoGen', { duration: 8, model: 'veo-3.1-fast' }),
      nodeId: 'video-1',
      startedAt: new Date(),
      videoPilotAcceptance: { passed: true, source: 'userReview' },
      workflowId: 'wf-1',
    });

    expect(result.kind).toBe('result');
    if (result.kind !== 'result') {
      return;
    }

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor.mock.calls[0]?.[0].config.duration).toBe(8);
    expect(result.result.creditsUsed).toBe(10);
    expect(result.result.output).toEqual({ video: 'full.mp4' });
  });

  it('records a rejected paid candidate and fails without running the full length', async () => {
    const executor = vi.fn().mockResolvedValue({ video: 'pilot.mp4' });

    const result = await service.execute({
      baseCreditCost: 10,
      evaluateVideoPilot: async () => ({
        failures: [
          {
            code: 'BLACK_FRAMES',
            message: 'opening second is black',
            timestamp: 0,
          },
        ],
        passed: false,
        source: 'videoQa',
      }),
      executor,
      gateConfig: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
      inputs: new Map(),
      lineage: makeLineage(),
      node: makeNode('videoGen', { duration: 8 }),
      nodeId: 'video-1',
      startedAt: new Date(),
      workflowId: 'wf-1',
    });

    expect(result.kind).toBe('result');
    if (result.kind !== 'result') {
      return;
    }

    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.result.status).toBe('failed');
    expect(result.result.creditsUsed).toBe(5);
    expect(result.result.videoGenerationLineage?.attempts[0]?.accepted).toBe(
      false,
    );
  });

  it('halts after three rejected paid candidates and makes no further provider calls', async () => {
    const executor = vi.fn();
    const lineage = makeLineage({
      attempts: [1, 2, 3].map((attemptNumber) => ({
        accepted: false,
        attemptKind: 'pilot' as const,
        attemptNumber,
        creditsCharged: 5,
        durationSeconds: 4,
        parameters: { durationSeconds: 4, prompt: 'same failing clip' },
        rejectionReason: 'BLACK_FRAMES',
      })),
    });

    const result = await service.execute({
      baseCreditCost: 10,
      executor,
      gateConfig: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
      inputs: new Map(),
      lineage,
      node: makeNode('videoGen', { duration: 8, prompt: 'same failing clip' }),
      nodeId: 'video-1',
      startedAt: new Date(),
      workflowId: 'wf-1',
    });

    expect(executor).not.toHaveBeenCalled();
    expect(result.kind).toBe('result');
    if (result.kind !== 'result') {
      return;
    }
    expect(result.result.status).toBe('failed');
    expect(result.result.creditsUsed).toBe(0);
    expect(result.result.error).toContain(VIDEO_GENERATION_GATE_HALT_PREFIX);
    const summary = parseVideoGenerationHaltError(result.result.error ?? '');
    expect(summary?.paidCandidateCount).toBe(3);
    expect(summary?.attempts).toHaveLength(3);
  });

  it('still applies the gate for generateVideo and video-generator aliases', async () => {
    const executor = vi.fn().mockResolvedValue({ video: 'pilot.mp4' });

    const result = await service.execute({
      baseCreditCost: 10,
      executor,
      gateConfig: DEFAULT_VIDEO_GENERATION_GATE_CONFIG,
      inputs: new Map(),
      lineage: makeLineage(),
      node: makeNode('video-generator', { duration: 8 }),
      nodeId: 'video-1',
      startedAt: new Date(),
      workflowId: 'wf-1',
    });

    expect(result.kind).toBe('result');
    expect(executor).toHaveBeenCalledTimes(1);
  });
});

describe('resolveRequestedDurationSeconds', () => {
  it('reads duration from node config, including numeric strings', () => {
    expect(
      resolveRequestedDurationSeconds(makeNode('videoGen', { duration: 8 })),
    ).toBe(8);
    expect(
      resolveRequestedDurationSeconds(makeNode('videoGen', { duration: '6' })),
    ).toBe(6);
  });
});

describe('createVideoGenerationLineage', () => {
  it('creates a stable lineage for a node within a workflow', () => {
    const lineage = createVideoGenerationLineage({
      lineageId: 'fixed-id',
      nodeId: 'video-1',
      workflowId: 'wf-1',
    });
    expect(lineage.lineageId).toBe('fixed-id');
    expect(lineage.attempts).toEqual([]);
  });
});
