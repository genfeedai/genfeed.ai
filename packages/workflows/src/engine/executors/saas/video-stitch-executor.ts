import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

export type VideoStitchTransitionType = 'cut' | 'crossfade' | 'wipe' | 'fade';
export type VideoStitchAudioCodec = 'aac' | 'mp3';
export type VideoStitchOutputQuality = 'full' | 'draft';

export interface VideoStitchResult {
  outputVideoUrl: string;
  jobId: string;
}

export interface VideoStitchProcessorParams {
  audioCodec: VideoStitchAudioCodec;
  brandId?: string;
  concatFilter: string;
  organizationId: string;
  outputQuality: VideoStitchOutputQuality;
  parentId?: string;
  providerData?: Record<string, unknown>;
  seamlessLoop: boolean;
  transitionDuration: number;
  transitionType: VideoStitchTransitionType;
  userId: string;
  videoUrls: string[];
}

export type VideoStitchProcessor = (
  params: VideoStitchProcessorParams,
) => Promise<VideoStitchResult>;

export interface VideoStitchConcatFilterOptions {
  hasAudio: boolean;
  transitionDuration: number;
  transitionType: VideoStitchTransitionType;
  videoCount: number;
}

const VALID_TRANSITION_TYPES: VideoStitchTransitionType[] = [
  'cut',
  'crossfade',
  'wipe',
  'fade',
];

const VALID_AUDIO_CODECS: VideoStitchAudioCodec[] = ['aac', 'mp3'];
const VALID_OUTPUT_QUALITIES: VideoStitchOutputQuality[] = ['full', 'draft'];

const XFADE_TRANSITION_MAP: Record<
  Exclude<VideoStitchTransitionType, 'cut'>,
  string
> = {
  crossfade: 'fade',
  fade: 'fadeblack',
  wipe: 'wipeleft',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractVideoUrl(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const candidates = [
    value.videoUrl,
    value.video,
    value.outputVideoUrl,
    value.outputVideo,
    value.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
    if (isRecord(candidate)) {
      const nested = extractVideoUrl(candidate);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function numberedVideoHandleIndex(key: string): number | null {
  const match = key.match(/^video-?(\d+)$/i);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

/**
 * Collect ordered source videos from stitch handles (`video-1`, `videos[]`)
 * without relying on engine multi-handle merging.
 */
export function collectVideoStitchUrls(
  inputs: Map<string, unknown>,
  config: Record<string, unknown>,
): string[] {
  const collected: string[] = [];
  const seen = new Set<string>();

  const add = (value: unknown): void => {
    const url = extractVideoUrl(value);
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    collected.push(url);
  };

  const videosHandle = inputs.get('videos');
  if (Array.isArray(videosHandle)) {
    for (const item of videosHandle) {
      add(item);
    }
  } else if (videosHandle !== undefined) {
    add(videosHandle);
  }

  const numberedKeys = [...inputs.keys()]
    .filter((key) => numberedVideoHandleIndex(key) !== null)
    .sort((left, right) => {
      return (
        (numberedVideoHandleIndex(left) ?? 0) -
        (numberedVideoHandleIndex(right) ?? 0)
      );
    });

  for (const key of numberedKeys) {
    add(inputs.get(key));
  }

  for (const key of ['video', 'videoUrl', 'inputVideo'] as const) {
    if (inputs.has(key)) {
      add(inputs.get(key));
    }
  }

  const configVideos = config.inputVideos;
  if (Array.isArray(configVideos)) {
    for (const item of configVideos) {
      add(item);
    }
  }

  return collected;
}

/**
 * Builds an FFmpeg concat filter. Cut uses the concat filter; other
 * transitions use xfade (same FFmpeg-pass tier as colorGrade/soundOverlay).
 */
export function buildFfmpegConcatFilter(
  options: VideoStitchConcatFilterOptions,
): string {
  const audioFlag = options.hasAudio ? 1 : 0;
  if (
    options.transitionType === 'cut' ||
    options.transitionDuration <= 0 ||
    options.videoCount < 2
  ) {
    return `concat=n=${options.videoCount}:v=1:a=${audioFlag}`;
  }

  const xfadeName = XFADE_TRANSITION_MAP[options.transitionType];
  const duration = options.transitionDuration.toFixed(3);
  const segments: string[] = [];

  for (let index = 0; index < options.videoCount - 1; index += 1) {
    const leftLabel = index === 0 ? '[0:v]' : `[v${index}]`;
    const rightLabel = `[${index + 1}:v]`;
    const outputLabel =
      index === options.videoCount - 2 ? '[outv]' : `[v${index + 1}]`;
    segments.push(
      `${leftLabel}${rightLabel}xfade=transition=${xfadeName}:duration=${duration}:offset=0${outputLabel}`,
    );
  }

  return segments.join(';');
}

export function buildFfmpegConcatDemuxerList(videoUrls: string[]): string {
  return videoUrls
    .map((url) => `file '${url.replace(/'/g, "'\\''")}'`)
    .join('\n');
}

/**
 * Video Stitch Executor
 *
 * Concatenates ordered clip-chain segments with FFmpeg (concat demuxer / filter).
 *
 * Node Type: videoStitch
 * Definition: @genfeedai/contracts/types videoStitch registry entry
 */
export class VideoStitchExecutor extends BaseExecutor {
  readonly nodeType = 'videoStitch';
  private processor: VideoStitchProcessor | null = null;

  setProcessor(processor: VideoStitchProcessor): void {
    this.processor = processor;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const transitionType = node.config.transitionType;
    if (
      transitionType &&
      !VALID_TRANSITION_TYPES.includes(
        transitionType as VideoStitchTransitionType,
      )
    ) {
      errors.push(
        'Invalid transition type. Must be: cut, crossfade, wipe, or fade',
      );
    }

    const transitionDuration = node.config.transitionDuration;
    if (
      transitionDuration !== undefined &&
      (typeof transitionDuration !== 'number' || transitionDuration < 0)
    ) {
      errors.push(
        'Transition duration must be a number greater than or equal to 0',
      );
    }

    const audioCodec = node.config.audioCodec;
    if (
      audioCodec &&
      !VALID_AUDIO_CODECS.includes(audioCodec as VideoStitchAudioCodec)
    ) {
      errors.push('Invalid audio codec. Must be: aac or mp3');
    }

    const outputQuality = node.config.outputQuality;
    if (
      outputQuality &&
      !VALID_OUTPUT_QUALITIES.includes(
        outputQuality as VideoStitchOutputQuality,
      )
    ) {
      errors.push('Invalid output quality. Must be: full or draft');
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
      throw new Error('Video stitch processor not configured');
    }

    const videoUrls = collectVideoStitchUrls(inputs, node.config);
    if (videoUrls.length < 2) {
      throw new Error('videoStitch requires at least 2 source videos');
    }

    const transitionType = this.getOptionalConfig<VideoStitchTransitionType>(
      node.config,
      'transitionType',
      'cut',
    );
    const transitionDuration = this.getOptionalConfig<number>(
      node.config,
      'transitionDuration',
      0,
    );
    const seamlessLoop = this.getOptionalConfig<boolean>(
      node.config,
      'seamlessLoop',
      false,
    );
    const audioCodec = this.getOptionalConfig<VideoStitchAudioCodec>(
      node.config,
      'audioCodec',
      'aac',
    );
    const outputQuality = this.getOptionalConfig<VideoStitchOutputQuality>(
      node.config,
      'outputQuality',
      'full',
    );
    const brandId = this.getOptionalConfig<string | undefined>(
      node.config,
      'brandId',
      undefined,
    );
    const parentId = this.getOptionalConfig<string | undefined>(
      node.config,
      'parentId',
      undefined,
    );
    const model = this.getOptionalConfig<string | undefined>(
      node.config,
      'model',
      undefined,
    );
    const dispatchMode = this.getOptionalConfig<string | undefined>(
      node.config,
      'dispatchMode',
      undefined,
    );

    const concatFilter = buildFfmpegConcatFilter({
      hasAudio: true,
      transitionDuration,
      transitionType,
      videoCount: videoUrls.length,
    });

    const result = await this.processor({
      audioCodec,
      brandId,
      concatFilter,
      organizationId: context.organizationId,
      outputQuality,
      parentId,
      providerData:
        model || dispatchMode
          ? {
              actionVerb: 'extend',
              dispatchMode: dispatchMode ?? 'fabricated',
              model,
            }
          : undefined,
      seamlessLoop,
      transitionDuration,
      transitionType,
      userId: context.userId,
      videoUrls,
    });

    return {
      data: {
        video: result.outputVideoUrl,
        videoUrl: result.outputVideoUrl,
      },
      metadata: {
        concatDemuxerList: buildFfmpegConcatDemuxerList(videoUrls),
        concatFilter,
        jobId: result.jobId,
        transitionType,
        videoCount: videoUrls.length,
      },
    };
  }
}

export function createVideoStitchExecutor(
  processor?: VideoStitchProcessor,
): VideoStitchExecutor {
  const executor = new VideoStitchExecutor();
  if (processor) {
    executor.setProcessor(processor);
  }
  return executor;
}
