import { BeatSensitivity } from '@genfeedai/enums';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export interface BeatAnalysisResult {
  tempo: number;
  beatTimestamps: number[];
  downbeats: number[];
  beatCount: number;
  analysisMethod: 'aubio' | 'ffmpeg';
  confidence: number;
}

export type BeatAnalyzer = (params: {
  organizationId: string;
  musicUrl: string;
  minBpm: number;
  maxBpm: number;
  beatSensitivity: BeatSensitivity;
}) => Promise<BeatAnalysisResult>;

/**
 * Beat Analysis Executor
 *
 * Detects tempo and beat timestamps from audio files.
 * Uses aubio for accurate onset detection with FFmpeg fallback.
 *
 * Node Type: beatAnalysis
 * Definition: @genfeedai/workflow-saas/nodes/beat-analysis.ts
 */
export class BeatAnalysisExecutor extends BaseExecutor {
  readonly nodeType = 'beatAnalysis';
  private analyzer: BeatAnalyzer | null = null;

  setAnalyzer(analyzer: BeatAnalyzer): void {
    this.analyzer = analyzer;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const minBpm = node.config.minBpm;
    if (
      minBpm !== undefined &&
      (typeof minBpm !== 'number' || minBpm < 20 || minBpm > 300)
    ) {
      errors.push('Min BPM must be between 20 and 300');
    }

    const maxBpm = node.config.maxBpm;
    if (
      maxBpm !== undefined &&
      (typeof maxBpm !== 'number' || maxBpm < 20 || maxBpm > 300)
    ) {
      errors.push('Max BPM must be between 20 and 300');
    }

    if (minBpm != null && maxBpm != null && minBpm > maxBpm) {
      errors.push('Min BPM cannot be greater than max BPM');
    }

    const beatSensitivity = node.config.beatSensitivity;
    if (
      beatSensitivity &&
      !Object.values(BeatSensitivity).includes(
        beatSensitivity as BeatSensitivity,
      )
    ) {
      errors.push(
        `Invalid beat sensitivity. Must be one of: ${Object.values(BeatSensitivity).join(', ')}`,
      );
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 2; // Beat analysis costs 2 credits
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.analyzer) {
      throw new Error('Beat analyzer not configured');
    }

    const musicUrl = this.getRequiredInput<string>(inputs, 'musicUrl');
    const minBpm = this.getOptionalConfig<number>(node.config, 'minBpm', 60);
    const maxBpm = this.getOptionalConfig<number>(node.config, 'maxBpm', 200);
    const beatSensitivity = this.getOptionalConfig<BeatSensitivity>(
      node.config,
      'beatSensitivity',
      BeatSensitivity.MEDIUM,
    );

    const result = await this.analyzer({
      beatSensitivity,
      maxBpm,
      minBpm,
      musicUrl,
      organizationId: context.organizationId,
    });

    return {
      data: {
        beatTimestamps: result.beatTimestamps,
        downbeats: result.downbeats,
        tempo: result.tempo,
      },
      metadata: {
        analysisMethod: result.analysisMethod,
        beatCount: result.beatCount,
        confidence: result.confidence,
      },
    };
  }
}

export function createBeatAnalysisExecutor(
  analyzer?: BeatAnalyzer,
): BeatAnalysisExecutor {
  const executor = new BeatAnalysisExecutor();
  if (analyzer) {
    executor.setAnalyzer(analyzer);
  }
  return executor;
}
