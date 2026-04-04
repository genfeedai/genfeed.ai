/**
 * Video Input Node Types
 *
 * This node accepts multiple video URLs as input for beat-synced editing.
 * Collects video files and calculates total duration for editing workflow.
 */

import type { BaseTrendNodeData } from './trend-shared';

export interface VideoInputNodeData extends BaseTrendNodeData {
  // Inputs
  videoUrls: string[];

  // Configuration
  maxVideos: number;
  minClipDuration: number;

  // Outputs
  videoFiles: string[];
  totalDuration: number | null;

  // Processing info
  videoCount: number | null;
  validationErrors: string[];
}

export const DEFAULT_VIDEO_INPUT_DATA: Partial<VideoInputNodeData> = {
  label: 'Video Input',
  maxVideos: 10,
  minClipDuration: 0.5,
  status: 'idle',
  totalDuration: null,
  validationErrors: [],
  videoCount: null,
  videoFiles: [],
  videoUrls: [],
};

export const videoInputNodeDefinition = {
  category: 'input' as const,
  defaultData: DEFAULT_VIDEO_INPUT_DATA,
  description: 'Accept multiple video URLs for beat-synced editing',
  icon: 'Video',
  inputs: [
    {
      id: 'videoUrls',
      label: 'Video URLs',
      multiple: true,
      required: true,
      type: 'text',
    },
  ],
  label: 'Video Input',
  outputs: [
    { id: 'videoFiles', label: 'Video Files', multiple: true, type: 'text' },
    { id: 'totalDuration', label: 'Total Duration (s)', type: 'number' },
    { id: 'videoCount', label: 'Video Count', type: 'number' },
  ],
  type: 'videoInput',
};
