import type {
  VideoQaFailure,
  VideoQaFailureCode,
  VideoQaReport,
  VideoQaSegment,
  VideoQaStreamInfo,
} from '@genfeedai/types';
import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

export const DEFAULT_VIDEO_QA_LOUDNESS_TARGET_LUFS = -16;
export const DEFAULT_VIDEO_QA_LOUDNESS_TOLERANCE_LUFS = 2;
export const DEFAULT_VIDEO_QA_BLACK_DURATION_SECONDS = 0.5;
export const DEFAULT_VIDEO_QA_FREEZE_DURATION_SECONDS = 2;
const DURATION_TOLERANCE_SECONDS = 0.25;
const FRAME_RATE_TOLERANCE = 0.05;

export interface VideoQaInspectionRaw {
  probeJson: string;
  detectLog: string;
  loudnessLog: string | null;
  decodeOk: boolean;
  contactSheetUrl: string | null;
}

export interface VideoQaContract {
  loudnessTargetLufs: number;
  loudnessToleranceLufs: number;
  expectedDurationSeconds?: number | null;
  expectedWidth?: number | null;
  expectedHeight?: number | null;
  expectedFrameRate?: number | null;
  hasExpectedAudio?: boolean | null;
}

export interface VideoQaExecutorOutput extends VideoQaReport {
  report: VideoQaReport;
  video: string | null;
}

export type VideoQaProcessor = (params: {
  organizationId: string;
  videoUrl: string;
  isContactSheetEnabled: boolean;
  blackDurationSeconds: number;
  freezeDurationSeconds: number;
}) => Promise<VideoQaInspectionRaw>;

interface ParsedProbe {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  streams: VideoQaStreamInfo[];
}

interface ProbeStreamRecord {
  avg_frame_rate?: unknown;
  channels?: unknown;
  codec_name?: unknown;
  codec_type?: unknown;
  height?: unknown;
  r_frame_rate?: unknown;
  width?: unknown;
}

interface ProbeJsonRecord {
  format?: { duration?: unknown };
  streams?: ProbeStreamRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseFrameRate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value !== 'string' || value.length === 0 || value === '0/0') {
    return null;
  }
  if (value.includes('/')) {
    const [numeratorRaw, denominatorRaw] = value.split('/');
    const numerator = Number(numeratorRaw);
    const denominator = Number(denominatorRaw);
    if (
      !Number.isFinite(numerator) ||
      !Number.isFinite(denominator) ||
      denominator === 0
    ) {
      return null;
    }
    return numerator / denominator;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseFfprobeStreams(probeJson: string): ParsedProbe {
  let parsed: unknown;
  try {
    parsed = JSON.parse(probeJson) as unknown;
  } catch {
    return {
      durationSeconds: null,
      frameRate: null,
      height: null,
      streams: [],
      width: null,
    };
  }

  const record = isRecord(parsed) ? (parsed as ProbeJsonRecord) : {};
  const streams: VideoQaStreamInfo[] = [];
  let width: number | null = null;
  let height: number | null = null;
  let frameRate: number | null = null;

  for (const stream of record.streams ?? []) {
    const codecType =
      typeof stream.codec_type === 'string' ? stream.codec_type : 'unknown';
    const info: VideoQaStreamInfo = {
      channels: readFiniteNumber(stream.channels),
      codecName:
        typeof stream.codec_name === 'string' ? stream.codec_name : null,
      codecType,
      frameRate: parseFrameRate(stream.avg_frame_rate ?? stream.r_frame_rate),
      height: readFiniteNumber(stream.height),
      width: readFiniteNumber(stream.width),
    };
    streams.push(info);
    if (codecType === 'video' && width === null) {
      width = info.width;
      height = info.height;
      frameRate = info.frameRate ?? parseFrameRate(stream.r_frame_rate);
    }
  }

  return {
    durationSeconds: readFiniteNumber(record.format?.duration),
    frameRate,
    height,
    streams,
    width,
  };
}

export function parseBlackDetectLog(log: string): VideoQaSegment[] {
  const segments: VideoQaSegment[] = [];
  const pattern =
    /black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)(?:\s+black_duration:\s*[\d.]+)?/g;
  for (const match of log.matchAll(pattern)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      segments.push({ end, start });
    }
  }
  return segments;
}

export function parseFreezeDetectLog(
  log: string,
  durationSeconds?: number | null,
): VideoQaSegment[] {
  const segments: VideoQaSegment[] = [];
  let pendingStart: number | null = null;
  const lines = log.split(/\r?\n/);

  for (const line of lines) {
    const startMatch = line.match(/freeze_start:\s*([\d.]+)/);
    if (startMatch) {
      pendingStart = Number(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/freeze_end:\s*([\d.]+)/);
    if (endMatch && pendingStart !== null) {
      const end = Number(endMatch[1]);
      if (Number.isFinite(pendingStart) && Number.isFinite(end)) {
        segments.push({ end, start: pendingStart });
      }
      pendingStart = null;
    }
  }

  if (
    pendingStart !== null &&
    durationSeconds !== null &&
    durationSeconds !== undefined
  ) {
    segments.push({ end: durationSeconds, start: pendingStart });
  }

  return segments;
}

export function parseEbur128IntegratedLoudness(log: string): number | null {
  const matches = [...log.matchAll(/I:\s*(-?[\d.]+)\s+LUFS/g)];
  const last = matches.at(-1);
  if (!last) {
    return null;
  }
  const value = Number(last[1]);
  return Number.isFinite(value) ? value : null;
}

function pushFailure(
  failures: VideoQaFailure[],
  code: VideoQaFailureCode,
  message: string,
  timestamp: number | null = null,
): void {
  failures.push({ code, message, timestamp });
}

function formatSeconds(value: number): string {
  return value.toFixed(2);
}

export function buildVideoQaReport(args: {
  inspection: VideoQaInspectionRaw;
  contract: VideoQaContract;
}): VideoQaReport {
  const { inspection, contract } = args;
  const failures: VideoQaFailure[] = [];
  const probe = parseFfprobeStreams(inspection.probeJson);
  const hasAudio = probe.streams.some((stream) => stream.codecType === 'audio');
  const hasVideo = probe.streams.some((stream) => stream.codecType === 'video');
  const blackSegments = parseBlackDetectLog(inspection.detectLog);
  const freezeSegments = parseFreezeDetectLog(
    inspection.detectLog,
    probe.durationSeconds,
  );
  const loudnessLufs = hasAudio
    ? parseEbur128IntegratedLoudness(inspection.loudnessLog ?? '')
    : null;
  const loudnessDeviation =
    loudnessLufs === null ? null : loudnessLufs - contract.loudnessTargetLufs;

  if (!inspection.decodeOk || !hasVideo) {
    pushFailure(
      failures,
      'DECODE_FAILED',
      'Video did not decode a usable video stream',
    );
  }

  if (
    contract.expectedDurationSeconds !== null &&
    contract.expectedDurationSeconds !== undefined &&
    probe.durationSeconds !== null &&
    Math.abs(probe.durationSeconds - contract.expectedDurationSeconds) >
      DURATION_TOLERANCE_SECONDS
  ) {
    pushFailure(
      failures,
      'DURATION_MISMATCH',
      `Duration ${probe.durationSeconds}s does not match expected ${contract.expectedDurationSeconds}s`,
    );
  }

  if (
    (contract.expectedWidth !== null &&
      contract.expectedWidth !== undefined &&
      probe.width !== contract.expectedWidth) ||
    (contract.expectedHeight !== null &&
      contract.expectedHeight !== undefined &&
      probe.height !== contract.expectedHeight)
  ) {
    pushFailure(
      failures,
      'RESOLUTION_MISMATCH',
      `Resolution ${probe.width ?? '?'}x${probe.height ?? '?'} does not match expected ${contract.expectedWidth ?? '?'}x${contract.expectedHeight ?? '?'}`,
    );
  }

  if (
    contract.expectedFrameRate !== null &&
    contract.expectedFrameRate !== undefined &&
    probe.frameRate !== null &&
    Math.abs(probe.frameRate - contract.expectedFrameRate) >
      FRAME_RATE_TOLERANCE
  ) {
    pushFailure(
      failures,
      'FRAME_RATE_MISMATCH',
      `Frame rate ${probe.frameRate} does not match expected ${contract.expectedFrameRate}`,
    );
  }

  if (contract.hasExpectedAudio === true && !hasAudio) {
    pushFailure(
      failures,
      'STREAM_LAYOUT_MISMATCH',
      'Expected an audio stream but none was present',
    );
  }

  for (const segment of blackSegments) {
    pushFailure(
      failures,
      'BLACK_FRAMES',
      `Black-frame segment ${formatSeconds(segment.start)}s–${formatSeconds(segment.end)}s`,
      segment.start,
    );
  }

  for (const segment of freezeSegments) {
    pushFailure(
      failures,
      'FREEZE_FRAMES',
      `Freeze segment ${formatSeconds(segment.start)}s–${formatSeconds(segment.end)}s`,
      segment.start,
    );
  }

  if (
    hasAudio &&
    loudnessDeviation !== null &&
    Math.abs(loudnessDeviation) > contract.loudnessToleranceLufs
  ) {
    pushFailure(
      failures,
      'LOUDNESS_OFF_TARGET',
      `Loudness ${loudnessLufs?.toFixed(1)} LUFS vs target ${contract.loudnessTargetLufs} LUFS`,
    );
  }

  return {
    blackSegments,
    contactSheetUrl: inspection.contactSheetUrl,
    decodeOk: inspection.decodeOk && hasVideo,
    durationSeconds: probe.durationSeconds,
    failures,
    frameRate: probe.frameRate,
    freezeSegments,
    height: probe.height,
    loudnessDeviation,
    loudnessLufs,
    loudnessTargetLufs: contract.loudnessTargetLufs,
    passed: failures.length === 0,
    streams: probe.streams,
    width: probe.width,
  };
}

function resolveVideoUrl(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (isRecord(value)) {
    const candidates = [value.videoUrl, value.video, value.url, value.mediaUrl];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
      if (isRecord(candidate) && typeof candidate.videoUrl === 'string') {
        return candidate.videoUrl;
      }
    }
  }

  throw new Error('Missing required input: video');
}

function readOptionalNumber(
  config: Record<string, unknown>,
  key: string,
): number | null {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalBoolean(
  config: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = config[key];
  return typeof value === 'boolean' ? value : null;
}

function isPositiveNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Video QA Executor
 *
 * Deterministic FFmpeg/ffprobe inspection. No vision or LLM scoring.
 * Failed checks return a structured report with passed: false and do not
 * forward the source video.
 *
 * Node Type: videoQa
 */
export class VideoQaExecutor extends BaseExecutor {
  readonly nodeType = 'videoQa';
  private processor: VideoQaProcessor | null = null;

  setProcessor(processor: VideoQaProcessor): void {
    this.processor = processor;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const loudnessTarget = node.config.loudnessTargetLufs;
    if (loudnessTarget !== undefined && !isFiniteNumber(loudnessTarget)) {
      errors.push('loudnessTargetLufs must be a finite number');
    }

    const loudnessTolerance = node.config.loudnessToleranceLufs;
    if (
      loudnessTolerance !== undefined &&
      (!isFiniteNumber(loudnessTolerance) || (loudnessTolerance as number) < 0)
    ) {
      errors.push('loudnessToleranceLufs must be a number >= 0');
    }

    for (const field of [
      'freezeDurationSeconds',
      'blackDurationSeconds',
    ] as const) {
      const value = node.config[field];
      if (value !== undefined && !isPositiveNumber(value)) {
        errors.push(`${field} must be a number greater than 0`);
      }
    }

    for (const field of [
      'expectedDurationSeconds',
      'expectedWidth',
      'expectedHeight',
      'expectedFrameRate',
    ] as const) {
      const value = node.config[field];
      if (value !== undefined && value !== null && !isPositiveNumber(value)) {
        errors.push(`${field} must be a positive number when set`);
      }
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 1;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.processor) {
      throw new Error('Video QA processor not configured');
    }

    const videoValue = inputs.has('video')
      ? inputs.get('video')
      : inputs.get('videoUrl');
    const videoUrl = resolveVideoUrl(videoValue);

    const loudnessTargetLufs = this.getOptionalConfig<number>(
      node.config,
      'loudnessTargetLufs',
      DEFAULT_VIDEO_QA_LOUDNESS_TARGET_LUFS,
    );
    const loudnessToleranceLufs = this.getOptionalConfig<number>(
      node.config,
      'loudnessToleranceLufs',
      DEFAULT_VIDEO_QA_LOUDNESS_TOLERANCE_LUFS,
    );
    const blackDurationSeconds = this.getOptionalConfig<number>(
      node.config,
      'blackDurationSeconds',
      DEFAULT_VIDEO_QA_BLACK_DURATION_SECONDS,
    );
    const freezeDurationSeconds = this.getOptionalConfig<number>(
      node.config,
      'freezeDurationSeconds',
      DEFAULT_VIDEO_QA_FREEZE_DURATION_SECONDS,
    );
    const isContactSheetEnabled = this.getOptionalConfig<boolean>(
      node.config,
      'isContactSheetEnabled',
      false,
    );

    const inspection = await this.processor({
      blackDurationSeconds,
      freezeDurationSeconds,
      isContactSheetEnabled,
      organizationId: context.organizationId,
      videoUrl,
    });

    const report = buildVideoQaReport({
      contract: {
        expectedDurationSeconds: readOptionalNumber(
          node.config,
          'expectedDurationSeconds',
        ),
        expectedFrameRate: readOptionalNumber(node.config, 'expectedFrameRate'),
        expectedHeight: readOptionalNumber(node.config, 'expectedHeight'),
        expectedWidth: readOptionalNumber(node.config, 'expectedWidth'),
        hasExpectedAudio: readOptionalBoolean(node.config, 'hasExpectedAudio'),
        loudnessTargetLufs,
        loudnessToleranceLufs,
      },
      inspection,
    });

    const output: VideoQaExecutorOutput = {
      ...report,
      report,
      video: report.passed ? videoUrl : null,
    };

    return {
      data: output,
      metadata: {
        failureCount: report.failures.length,
        passed: report.passed,
      },
    };
  }
}

export function createVideoQaExecutor(
  processor?: VideoQaProcessor,
): VideoQaExecutor {
  const executor = new VideoQaExecutor();
  if (processor) {
    executor.setProcessor(processor);
  }
  return executor;
}
