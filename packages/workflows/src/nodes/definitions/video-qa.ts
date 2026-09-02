/**
 * Video QA Node Types
 *
 * Deterministic FFmpeg/ffprobe inspection (decode, black-frame, freeze,
 * loudness) plus advisory vision continuity against canonical references.
 */

import type { VideoQaNodeData } from '@genfeedai/contracts/types';

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
  isContinuityQaEnabled: false,
  characterReferenceUrls: [],
  productReferenceUrls: [],
  jobId: null,
  label: 'Video QA',
  loudnessTargetLufs: -16,
  loudnessToleranceLufs: 2,
  report: null,
  status: 'idle',
};
