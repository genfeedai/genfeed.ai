import type {
  AgentStrategyWorkflowInputPreview,
  RunAgentStrategyWorkflowInput,
} from '@services/automation/agent-strategies.service';

export interface WorkflowIngredientSelection {
  id: string;
  /** Public or signed URL of the library image. */
  url: string;
  label?: string;
}

/** Keys covered by the fixed topic/prompt/cta/image form fields. */
export const STANDARD_WORKFLOW_SLOT_KEYS = new Set([
  'topic',
  'titleText',
  'title',
  'visualAngle',
  'prompt',
  'script',
  'angle',
  'body',
  'copy',
  'cta',
  'ctaText',
  'callToAction',
  'referenceImage',
  'photoUrl',
  'imageUrl',
  'image',
  'assetUrl',
  'referenceImageId',
  'ingredientId',
]);

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

/**
 * Map dialog form state (+ optional library ingredient) into run-workflow body.
 * Ingredient selection wins over free-text URL for reference image slots.
 * `extraInputs` merge into `inputs` last for exact workflow keys.
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

  if (form.extraInputs) {
    for (const [key, raw] of Object.entries(form.extraInputs)) {
      const value = raw.trim();
      if (key && value) {
        inputs[key] = value;
      }
    }
  }

  return {
    cta,
    prompt,
    referenceImage: imageUrl,
    topic,
    ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
  };
}

/**
 * Slots that need a free-form editor (not covered by standard form fields).
 * Prefers required unfilled keys; includes optional unfilled when few required.
 */
export function listEditableExtraSlots(
  inputs: AgentStrategyWorkflowInputPreview[] | undefined,
): AgentStrategyWorkflowInputPreview[] {
  if (!inputs?.length) {
    return [];
  }

  return inputs.filter((input) => {
    if (STANDARD_WORKFLOW_SLOT_KEYS.has(input.key)) {
      return false;
    }
    const isFilled =
      input.filledValue != null && String(input.filledValue).trim() !== '';
    if (isFilled && !input.required) {
      return false;
    }
    // Always allow editing unfilled required; also show unfilled optional extras.
    return !isFilled || input.required;
  });
}

export function seedExtraInputsFromBinding(
  inputs: AgentStrategyWorkflowInputPreview[] | undefined,
): Record<string, string> {
  const seeded: Record<string, string> = {};
  for (const input of listEditableExtraSlots(inputs)) {
    if (input.filledValue != null && String(input.filledValue).trim()) {
      seeded[input.key] = String(input.filledValue);
    } else if (
      input.defaultValue != null &&
      String(input.defaultValue).trim()
    ) {
      seeded[input.key] = String(input.defaultValue);
    } else {
      seeded[input.key] = '';
    }
  }
  return seeded;
}
