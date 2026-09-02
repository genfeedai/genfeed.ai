/**
 * Sound Overlay Node Types
 *
 * This node adds an audio track to a generated video using FFmpeg.
 * Supports replace, mix, and background modes with volume controls.
 */

import type { BaseTrendNodeData, MixMode } from './trend-shared';

export interface SoundOverlayNodeData extends BaseTrendNodeData {
  // Inputs
  videoUrl: string | null;
  soundUrl: string | null;

  // Configuration
  mixMode: MixMode;
  audioVolume: number;
  videoVolume: number;
  fadeIn: number;
  fadeOut: number;

  // Output
  outputVideoUrl: string | null;

  // Processing info (for display)
  jobId: string | null;
  processingProgress: number | null;
}

export const DEFAULT_SOUND_OVERLAY_DATA: Partial<SoundOverlayNodeData> = {
  audioVolume: 100,
  fadeIn: 0,
  fadeOut: 0,
  jobId: null,
  label: 'Sound Overlay',
  mixMode: 'replace',
  outputVideoUrl: null,
  processingProgress: null,
  soundUrl: null,
  status: 'idle',
  videoUrl: null,
  videoVolume: 0,
};
