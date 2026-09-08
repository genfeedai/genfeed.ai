export interface WorkflowIngredientSelection {
  id: string;
  /** Public or signed URL of the library image. */
  url: string;
  label?: string;
}

export interface AgentWorkflowRunFormState {
  cta?: string;
  /** Extra slot values keyed by workflow inputVariable key. */
  extraInputs?: Record<string, string>;
  prompt?: string;
  /** Free-text URL fallback when no library ingredient is selected. */
  referenceImageUrl?: string;
  selectedIngredient?: WorkflowIngredientSelection | null;
  topic?: string;
}
