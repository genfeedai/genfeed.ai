import { ModelCategory } from '@genfeedai/contracts';

/**
 * Catalog categories each workflow action can run. An action not listed here
 * keeps its plain `model` text field: its models are not a catalog choice.
 */
const WORKFLOW_ACTION_MODEL_CATEGORIES: Readonly<
  Record<string, readonly ModelCategory[]>
> = {
  imageGen: [ModelCategory.IMAGE],
  llm: [ModelCategory.TEXT],
  videoGen: [ModelCategory.VIDEO],
};

export function getWorkflowActionModelCategories(
  actionId: string,
): readonly ModelCategory[] | undefined {
  return WORKFLOW_ACTION_MODEL_CATEGORIES[actionId];
}
