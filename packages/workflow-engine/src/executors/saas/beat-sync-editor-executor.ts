import { BeatSyncCutStrategy, BeatSyncTransitionType } from '@genfeedai/enums';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface BeatSyncEditorResult {
  outputVideoUrl: string;
  totalClips: number;
  totalDuration: number;
  jobId: string;
}

export type BeatSyncEditor = (params: {
  organizationId: string;
  videoFiles: string[];
  beatTimestamps: number[];
  musicUrl: string;
  cutStrategy: BeatSyncCutStrategy;
  transitionType: BeatSyncTransitionType;
  transitionDuration: number;
  loopVideos: boolean;
  shuffleOrder: boolean;
  beatsPerClip: number;
  customPattern?: number[];
}) => Promise<BeatSyncEditorResult>;

/**
 * Beat Sync Editor Executor
 *
 * Cuts and assembles videos to match beat timestamps.
 * Supports multiple cut strategies and transition types.
 *
 * Node Type: beatSyncEditor
 * Definition: @cloud/workflow-saas/nodes/beat-sync-editor.ts
 */
export class BeatSyncEditorExecutor extends BaseExecutor {
  readonly nodeType = 'beatSyncEditor';
  private editor: BeatSyncEditor | null = null;

  setEditor(editor: BeatSyncEditor): void {
    this.editor = editor;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const cutStrategy = node.config.cutStrategy;
    if (
      cutStrategy &&
      !Object.values(BeatSyncCutStrategy).includes(
        cutStrategy as BeatSyncCutStrategy,
      )
    ) {
      errors.push(
        `Invalid cut strategy. Must be one of: ${Object.values(BeatSyncCutStrategy).join(', ')}`,
      );
    }

    const transitionType = node.config.transitionType;
    if (
      transitionType &&
      !Object.values(BeatSyncTransitionType).includes(
        transitionType as BeatSyncTransitionType,
      )
    ) {
      errors.push(
        `Invalid transition type. Must be one of: ${Object.values(BeatSyncTransitionType).join(', ')}`,
      );
    }

    const transitionDuration = node.config.transitionDuration;
    if (
      transitionDuration !== undefined &&
      (typeof transitionDuration !== 'number' ||
        transitionDuration < 0 ||
        transitionDuration > 1000)
    ) {
      errors.push(
        'Transition duration must be between 0 and 1000 milliseconds',
      );
    }

    const beatsPerClip = node.config.beatsPerClip;
    if (
      beatsPerClip !== undefined &&
      (typeof beatsPerClip !== 'number' ||
        beatsPerClip < 1 ||
        beatsPerClip > 16)
    ) {
      errors.push('Beats per clip must be between 1 and 16');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(node: ExecutableNode): number {
    // Cost based on expected processing complexity
    const beatsPerClip = (node.config.beatsPerClip as number) || 1;
    const transitionType = node.config.transitionType as BeatSyncTransitionType;

    let baseCost = 5; // Base video processing cost

    // More clips = more processing
    if (beatsPerClip === 1) {
      baseCost += 3; // Maximum clips
    }

    // Transitions add processing overhead
    if (transitionType !== BeatSyncTransitionType.CUT) {
      baseCost += 2;
    }

    return baseCost;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.editor) {
      throw new Error('Beat sync editor not configured');
    }

    // Get required inputs
    const rawVideoFiles = inputs.get('videoFiles');
    let videoFiles: string[];

    if (Array.isArray(rawVideoFiles)) {
      videoFiles = rawVideoFiles.filter(
        (f): f is string => typeof f === 'string',
      );
    } else if (typeof rawVideoFiles === 'string') {
      videoFiles = [rawVideoFiles];
    } else {
      throw new Error('Missing required input: videoFiles');
    }

    if (videoFiles.length === 0) {
      throw new Error('At least one video file is required');
    }

    const rawBeatTimestamps = inputs.get('beatTimestamps');
    let beatTimestamps: number[];

    if (Array.isArray(rawBeatTimestamps)) {
      beatTimestamps = rawBeatTimestamps.filter(
        (t): t is number => typeof t === 'number',
      );
    } else if (
      typeof rawBeatTimestamps === 'object' &&
      rawBeatTimestamps !== null
    ) {
      // Handle case where beat analysis returns an object with beatTimestamps property
      const beatData = rawBeatTimestamps as { beatTimestamps?: number[] };
      beatTimestamps = beatData.beatTimestamps || [];
    } else {
      throw new Error('Missing required input: beatTimestamps');
    }

    if (beatTimestamps.length === 0) {
      throw new Error('At least one beat timestamp is required');
    }

    const musicUrl = this.getRequiredInput<string>(inputs, 'musicUrl');

    // Get configuration
    const cutStrategy = this.getOptionalConfig<BeatSyncCutStrategy>(
      node.config,
      'cutStrategy',
      BeatSyncCutStrategy.EVERY_BEAT,
    );
    const transitionType = this.getOptionalConfig<BeatSyncTransitionType>(
      node.config,
      'transitionType',
      BeatSyncTransitionType.CUT,
    );
    const transitionDuration = this.getOptionalConfig<number>(
      node.config,
      'transitionDuration',
      50,
    );
    const loopVideos = this.getOptionalConfig<boolean>(
      node.config,
      'loopVideos',
      true,
    );
    const shuffleOrder = this.getOptionalConfig<boolean>(
      node.config,
      'shuffleOrder',
      false,
    );
    const beatsPerClip = this.getOptionalConfig<number>(
      node.config,
      'beatsPerClip',
      1,
    );
    const customPattern = this.getOptionalConfig<number[]>(
      node.config,
      'customPattern',
      [],
    );

    const result = await this.editor({
      beatsPerClip,
      beatTimestamps,
      customPattern,
      cutStrategy,
      loopVideos,
      musicUrl,
      organizationId: context.organizationId,
      shuffleOrder,
      transitionDuration,
      transitionType,
      videoFiles,
    });

    return {
      data: result.outputVideoUrl,
      metadata: {
        jobId: result.jobId,
        totalClips: result.totalClips,
        totalDuration: result.totalDuration,
      },
    };
  }
}

export function createBeatSyncEditorExecutor(
  editor?: BeatSyncEditor,
): BeatSyncEditorExecutor {
  const executor = new BeatSyncEditorExecutor();
  if (editor) {
    executor.setEditor(editor);
  }
  return executor;
}
