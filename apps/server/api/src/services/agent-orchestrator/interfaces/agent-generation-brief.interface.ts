/** One detail a media request must settle before the agent builds it. */
export interface GenerationBriefField {
  id: string;
  /** How the question is worded to the user and to the planner. */
  label: string;
  /**
   * The `generate` parameter that proves the user settled this detail. A field
   * without one is asked about through the prompt only; code cannot read it.
   */
  parameter?: 'aspectRatio' | 'duration';
  /** Sample options for the question card. */
  suggestion?: string;
}
