/** How long an edited clip may run. Shorter is not a clip; longer is a different job. */
export const CLIPPER_CLIP_EDIT_LIMITS = {
  MAX_DURATION_SECONDS: 180,
  MIN_DURATION_SECONDS: 1,
} as const;

/** A new cut of an existing raw-cut clip. Unset fields keep the clip's own value. */
export interface IClipperClipEditRequest {
  clipperResultId: string;
  /** Source-video seconds where the new cut ends. */
  endTime?: number;
  /** Source-video seconds where the new cut starts. */
  startTime?: number;
  title?: string;
}

/** What an edit queued. The original clip is kept; the edit is a new version. */
export interface IClipperClipEditResult {
  /** Caption cues in the new window; the edit fails before this reaches zero. */
  captionCueCount: number;
  clipperResultId: string;
  duration: number;
  editedFromClipperResultId: string;
  endTime: number;
  projectId: string;
  startTime: number;
  status: string;
}

/** How much transcript `get_clip_context` hands the agent around a clip. */
export const CLIPPER_CLIP_CONTEXT_LIMITS = {
  MAX_TRANSCRIPT_SEGMENTS: 120,
  TRANSCRIPT_PADDING_SECONDS: 30,
} as const;

export interface IClipperClipSummary {
  clipperResultId: string;
  duration: number | null;
  endTime: number | null;
  /** Raw-cut and finished: the two things `edit_clip` needs. */
  isEditable: boolean;
  mode: string | null;
  startTime: number | null;
  status: string | null;
  title: string;
}

export interface IClipperTranscriptLine {
  end: number;
  start: number;
  text: string;
}

/** A clip and the transcript around it, so a new window can land on sentence boundaries. */
export interface IClipperClipContext {
  clip: IClipperClipSummary;
  projectId: string;
  sourceDurationSeconds: number | null;
  /** Lines overlapping the clip plus padding either side, in source-video seconds. */
  transcript: IClipperTranscriptLine[];
}

export interface IClipperProjectClips {
  clips: IClipperClipSummary[];
  projectId: string;
}
