/**
 * Beat Sync Editor Node Types
 *
 * This node cuts and assembles videos to match beat timestamps.
 * Supports multiple cut strategies and transition types.
 */

import { BeatSyncCutStrategy, BeatSyncTransitionType } from '@genfeedai/enums';
import type { BaseTrendNodeData } from './trend-shared';

export interface BeatSyncEditorNodeData extends BaseTrendNodeData {
  // Inputs
  videoFiles: string[];
  beatTimestamps: number[];
  musicUrl: string | null;

  // Configuration
  cutStrategy: BeatSyncCutStrategy;
  transitionType: BeatSyncTransitionType;
  transitionDuration: number;
  loopVideos: boolean;
  shuffleOrder: boolean;
  beatsPerClip: number;
  customPattern: number[];

  // Outputs
  outputVideoUrl: string | null;

  // Processing info
  totalClips: number | null;
  totalDuration: number | null;
  jobId: string | null;
  processingProgress: number | null;
}

export const DEFAULT_BEAT_SYNC_EDITOR_DATA: Partial<BeatSyncEditorNodeData> = {
  beatsPerClip: 1,
  beatTimestamps: [],
  customPattern: [],
  cutStrategy: BeatSyncCutStrategy.EVERY_BEAT,
  jobId: null,
  label: 'Beat Sync Editor',
  loopVideos: true,
  musicUrl: null,
  outputVideoUrl: null,
  processingProgress: null,
  shuffleOrder: false,
  status: 'idle',
  totalClips: null,
  totalDuration: null,
  transitionDuration: 50,
  transitionType: BeatSyncTransitionType.CUT,
  videoFiles: [],
};

export const beatSyncEditorNodeDefinition = {
  category: 'processing' as const,
  defaultData: DEFAULT_BEAT_SYNC_EDITOR_DATA,
  description: 'Cut videos to match beat timestamps',
  icon: 'Scissors',
  inputs: [
    {
      id: 'videoFiles',
      label: 'Video Files',
      multiple: true,
      required: true,
      type: 'text',
    },
    {
      id: 'beatTimestamps',
      label: 'Beat Timestamps',
      multiple: true,
      required: true,
      type: 'number',
    },
    { id: 'musicUrl', label: 'Music URL', required: true, type: 'text' },
  ],
  label: 'Beat Sync Editor',
  outputs: [
    { id: 'videoUrl', label: 'Output Video', type: 'text' },
    { id: 'totalClips', label: 'Total Clips', type: 'number' },
    { id: 'totalDuration', label: 'Total Duration (s)', type: 'number' },
  ],
  type: 'beatSyncEditor',
};
