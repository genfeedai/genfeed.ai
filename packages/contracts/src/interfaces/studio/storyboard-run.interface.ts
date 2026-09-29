/**
 * Editable generation recipe of a storyboard run, as the Storyboard run page
 * holds it between server revisions. The output kind is fixed by the run.
 */
export interface StoryboardRunRecipe {
  /** Absent for copy output, which has no frame. */
  aspectRatio?: string;
  count: number;
  durationSeconds?: number;
  objective: string;
  /** Explicit Library references in order; brand defaults stay server-owned. */
  referenceAssetIds: string[];
}

export interface StoryboardRunSelectOption {
  label: string;
  value: string;
}
