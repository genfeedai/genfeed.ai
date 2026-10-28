/** The kind of build a brief checklist covers. */
export type GenerationBriefKind = 'image' | 'post' | 'video';

/** One detail a media request must settle before the agent builds it. */
export interface GenerationBriefField {
  id: string;
  /** How the question is worded to the user and to the planner. */
  label: string;
  /**
   * The tool parameter that proves the user settled this detail. A field
   * without one is asked about through the prompt only; code cannot read it.
   */
  parameter?: 'aspectRatio' | 'duration' | 'platform';
  /** Sample options for the question card. */
  suggestion?: string;
}

/** The fields a chat-driven call left out, and what it was building. */
export interface UnresolvedGenerationBrief {
  fields: GenerationBriefField[];
  kind: GenerationBriefKind;
  toolName: string;
}
