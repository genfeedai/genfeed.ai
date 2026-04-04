/**
 * Beat Analysis Node Types
 *
 * This node detects tempo and beat timestamps from audio files.
 * Uses aubio for accurate onset detection with FFmpeg fallback.
 */

import { BeatSensitivity } from '@genfeedai/enums';
import type { BaseTrendNodeData } from './trend-shared';

export interface BeatAnalysisNodeData extends BaseTrendNodeData {
  // Inputs
  musicUrl: string | null;

  // Configuration
  minBpm: number;
  maxBpm: number;
  beatSensitivity: BeatSensitivity;

  // Outputs
  tempo: number | null;
  beatTimestamps: number[];
  downbeats: number[];

  // Processing info
  beatCount: number | null;
  analysisMethod: 'aubio' | 'ffmpeg' | null;
  confidence: number | null;
}

export const DEFAULT_BEAT_ANALYSIS_DATA: Partial<BeatAnalysisNodeData> = {
  analysisMethod: null,
  beatCount: null,
  beatSensitivity: BeatSensitivity.MEDIUM,
  beatTimestamps: [],
  confidence: null,
  downbeats: [],
  label: 'Beat Analysis',
  maxBpm: 200,
  minBpm: 60,
  musicUrl: null,
  status: 'idle',
  tempo: null,
};

export const beatAnalysisNodeDefinition = {
  category: 'processing' as const,
  defaultData: DEFAULT_BEAT_ANALYSIS_DATA,
  description: 'Detect tempo and beat timestamps from audio',
  icon: 'Activity',
  inputs: [
    { id: 'musicUrl', label: 'Music URL', required: true, type: 'text' },
  ],
  label: 'Beat Analysis',
  outputs: [
    { id: 'tempo', label: 'Tempo (BPM)', type: 'number' },
    {
      id: 'beatTimestamps',
      label: 'Beat Timestamps',
      multiple: true,
      type: 'number',
    },
    { id: 'downbeats', label: 'Downbeats', multiple: true, type: 'number' },
    { id: 'beatCount', label: 'Beat Count', type: 'number' },
  ],
  type: 'beatAnalysis',
};
