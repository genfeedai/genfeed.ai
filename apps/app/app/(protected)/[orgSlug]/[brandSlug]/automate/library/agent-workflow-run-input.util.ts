import type { RunAgentStrategyWorkflowInput } from '@services/automation/agent-strategies.service';

export interface WorkflowIngredientSelection {
  id: string;
  /** Public or signed URL of the library image. */
  url: string;
  label?: string;
}

export interface AgentWorkflowRunFormState {
  cta?: string;
  prompt?: string;
  /** Free-text URL fallback when no library ingredient is selected. */
  referenceImageUrl?: string;
  selectedIngredient?: WorkflowIngredientSelection | null;
  topic?: string;
}

/**
 * Map dialog form state (+ optional library ingredient) into run-workflow body.
 * Ingredient selection wins over free-text URL for reference image slots.
 */
export function buildAgentWorkflowRunInput(
  form: AgentWorkflowRunFormState,
): RunAgentStrategyWorkflowInput {
  const topic = form.topic?.trim() || undefined;
  const prompt = form.prompt?.trim() || undefined;
  const cta = form.cta?.trim() || undefined;

  const ingredientUrl = form.selectedIngredient?.url?.trim() || '';
  const freeTextUrl = form.referenceImageUrl?.trim() || '';
  const imageUrl = ingredientUrl || freeTextUrl || undefined;

  const inputs: Record<string, unknown> = {};
  if (imageUrl) {
    inputs.referenceImage = imageUrl;
    inputs.photoUrl = imageUrl;
  }
  if (form.selectedIngredient?.id) {
    inputs.referenceImageId = form.selectedIngredient.id;
    inputs.ingredientId = form.selectedIngredient.id;
  }

  return {
    cta,
    prompt,
    referenceImage: imageUrl,
    topic,
    ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
  };
}
