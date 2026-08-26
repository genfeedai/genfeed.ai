export type TalkingHeadScriptSegmentPurpose = 'hook' | 'body' | 'cta';

/**
 * One duration-bounded clip in a talking-head script.
 *
 * `targetWordCount` is the maximum safe spoken-word budget for the clip.
 * `actualWordCount` is computed from `text`; consumers never need to trust
 * model-supplied timing metadata.
 */
export interface TalkingHeadScriptSegment {
  clipIndex: number;
  purpose: TalkingHeadScriptSegmentPurpose;
  text: string;
  targetDurationSeconds: number;
  targetWordCount: number;
  actualWordCount: number;
}

/** Typed output consumed by clip orchestration and avatar-video workflows. */
export interface TalkingHeadScript {
  clipCount: number;
  language: string;
  segments: TalkingHeadScriptSegment[];
  totalDurationSeconds: number;
  totalTargetWordCount: number;
  totalWordCount: number;
  wordsPerSecond: number;
}

/** Workflow-node output with both the full contract and connectable scalars. */
export interface TalkingHeadScriptNodeOutput {
  clipCount: number;
  script: TalkingHeadScript;
  segments: TalkingHeadScriptSegment[];
  fullText: string;
  totalDurationSeconds: number;
  totalTargetWordCount: number;
  totalWordCount: number;
  wordsPerSecond: number;
}
