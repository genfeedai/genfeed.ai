import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { evaluateMediaReadiness } from '@api/services/media-readiness/media-readiness.evaluator';
import type { MediaProbe } from '@genfeedai/contracts/api-types/contracts';
import {
  getPlatformMediaSpec,
  MEDIA_SPEC_PLATFORMS,
} from '@genfeedai/contracts/constants';
import type { Task } from '../bench/schema';
import type { Medium, ReadinessResult } from './contracts';

/**
 * Deterministic readiness (#4878) runs before any judge sees an answer. An
 * off-spec artifact is a void with a reason, never a loss: the task's own
 * output spec must hold (aspect ratio, video duration), and the artifact must
 * clear the #4878 media spec of at least one seeded platform for its kind.
 * Bench tasks are not tied to one platform, so any clean platform suffices.
 */

export const ASPECT_RATIO_TOLERANCE = 0.05;
/** A clip may run long; it may not run short by more than this share. */
export const MIN_DURATION_SHARE = 0.8;

export interface MediaProbePort {
  probe(url: string, medium: Medium, signal: AbortSignal): Promise<MediaProbe>;
}

const execFileAsync = promisify(execFile);

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; size?: string; format_name?: string };
}

function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const [numerator, denominator] = value.split('/').map(Number);
  if (!numerator || !denominator) return null;
  const rate = numerator / denominator;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function positiveInt(value: number | undefined): number | null {
  return typeof value === 'number' && value > 0 ? Math.round(value) : null;
}

export function normalizeFfprobe(
  output: FfprobeOutput,
  medium: Medium,
  probedAt: string,
): MediaProbe {
  const streams = output.streams ?? [];
  const visual = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number(output.format?.duration);
  const size = Number(output.format?.size);
  return {
    audioCodec: audio?.codec_name ?? null,
    container: output.format?.format_name?.split(',')[0] ?? null,
    durationSeconds:
      medium === 'video' && Number.isFinite(duration) ? duration : null,
    frameRate:
      medium === 'video' ? parseFrameRate(visual?.avg_frame_rate) : null,
    height: positiveInt(visual?.height),
    kind: medium,
    probedAt,
    sizeBytes: Number.isFinite(size) && size >= 0 ? Math.round(size) : null,
    videoCodec: medium === 'video' ? (visual?.codec_name ?? null) : null,
    width: positiveInt(visual?.width),
  };
}

/** ffprobe on the verification host; reads the artifact by URL, never writes it. */
export class FfprobeMediaProbe implements MediaProbePort {
  constructor(private readonly binary = 'ffprobe') {}

  async probe(
    url: string,
    medium: Medium,
    signal: AbortSignal,
  ): Promise<MediaProbe> {
    const { stdout } = await execFileAsync(
      this.binary,
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        url,
      ],
      { maxBuffer: 4 * 1024 * 1024, signal },
    );
    return normalizeFfprobe(
      JSON.parse(stdout) as FfprobeOutput,
      medium,
      new Date().toISOString(),
    );
  }
}

function parseAspectRatio(value: string): number | null {
  const [width, height] = value.split(':').map(Number);
  return width && height ? width / height : null;
}

/** Checks the task itself asks for, independent of any platform. */
export function checkTaskOutputSpec(task: Task, probe: MediaProbe): string[] {
  const problems: string[] = [];
  const expected = parseAspectRatio(task.outputSpec.aspectRatio);
  if (probe.width === null || probe.height === null) {
    problems.push('dimensions could not be probed');
  } else if (expected !== null) {
    const actual = probe.width / probe.height;
    if (Math.abs(actual - expected) / expected > ASPECT_RATIO_TOLERANCE) {
      problems.push(
        `aspect ratio ${probe.width}x${probe.height} does not match requested ${task.outputSpec.aspectRatio}`,
      );
    }
  }
  const requested = task.outputSpec.durationSeconds;
  if (task.medium === 'video' && requested !== undefined) {
    if (probe.durationSeconds === null) {
      problems.push('duration could not be probed');
    } else if (probe.durationSeconds < requested * MIN_DURATION_SHARE) {
      problems.push(
        `duration ${probe.durationSeconds.toFixed(1)}s is short of requested ${requested}s`,
      );
    }
  }
  return problems;
}

export function assessReadiness(
  task: Task,
  probe: MediaProbe,
  assetId: string,
): ReadinessResult {
  const taskProblems = checkTaskOutputSpec(task, probe);
  if (taskProblems.length > 0) {
    return { diagnostics: taskProblems, platform: null, status: 'blocked' };
  }

  const blockedBy: string[] = [];
  const platforms = MEDIA_SPEC_PLATFORMS.filter((platform) =>
    Boolean(getPlatformMediaSpec(platform, task.medium)),
  );
  for (const platform of platforms) {
    const report = evaluateMediaReadiness({
      assets: [{ assetId, kind: task.medium, probe }],
      platforms: [platform],
    });
    if (!report.isBlocked) {
      return {
        diagnostics: report.diagnostics.map((diagnostic) => diagnostic.message),
        platform,
        status: 'ready',
      };
    }
    blockedBy.push(
      ...report.diagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map((diagnostic) => diagnostic.message),
    );
  }
  return { diagnostics: blockedBy, platform: null, status: 'blocked' };
}
