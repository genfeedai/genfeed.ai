/**
 * Video QA Node Types
 *
 * Deterministic FFmpeg/ffprobe inspection (decode, black-frame, freeze,
 * loudness). Contact sheet rendering is optional and off by default.
 */

import type { VideoQaNodeData } from '@genfeedai/types';

export const DEFAULT_VIDEO_QA_DATA: Partial<VideoQaNodeData> = {
  blackDurationSeconds: 0.5,
  expectedDurationSeconds: null,
  expectedFrameRate: null,
  expectedHeight: null,
  expectedWidth: null,
  freezeDurationSeconds: 2,
  hasExpectedAudio: null,
  inputVideo: null,
  isContactSheetEnabled: false,
  jobId: null,
  label: 'Video QA',
  loudnessTargetLufs: -16,
  loudnessToleranceLufs: 2,
  report: null,
  status: 'idle',
};

export const videoQaNodeDefinition = {
  category: 'processing' as const,
  defaultData: DEFAULT_VIDEO_QA_DATA,
  description:
    'Inspect a video for decode, duration, resolution, black frames, freezes, and loudness. Contact sheet is off by default.',
  icon: 'ShieldCheck',
  inputs: [{ id: 'video', label: 'Video', required: true, type: 'video' }],
  label: 'Video QA',
  outputs: [
    { id: 'passed', label: 'Passed', type: 'text' },
    { id: 'report', label: 'QA Report', type: 'text' },
    { id: 'video', label: 'Video', type: 'video' },
  ],
  type: 'videoQa',
};
