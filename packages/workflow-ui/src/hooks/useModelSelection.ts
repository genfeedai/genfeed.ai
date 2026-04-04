import type { ProviderModel, WorkflowNodeData } from '@genfeedai/types';
import { useCallback } from 'react';
import { getSchemaDefaults } from '../lib/schemaUtils';
import { useWorkflowStore } from '../stores/workflowStore';

type ModelMap = Record<string, string>;

interface SelectedModelData {
  provider: string;
  modelId: string;
  displayName: string;
  inputSchema: Record<string, unknown> | undefined;
  componentSchemas: Record<string, unknown> | undefined;
}

interface UseModelSelectionOptions<TModel extends string> {
  /** Node ID to update */
  nodeId: string;
  /** Map of provider model IDs to internal model types */
  modelMap: ModelMap;
  /** Fallback internal model if not found in map */
  fallbackModel: TModel;
}

/**
 * Hook for handling model selection in AI generator nodes.
 * Consolidates the common pattern from ImageGenNode and VideoGenNode.
 *
 * @returns handleModelSelect callback to pass to ModelBrowserModal
 */
export function useModelSelection<
  TModel extends string,
  TNodeData extends WorkflowNodeData & { model?: TModel },
>({ nodeId, modelMap, fallbackModel }: UseModelSelectionOptions<TModel>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const handleModelSelect = useCallback(
    (model: ProviderModel) => {
      const internalModel = (modelMap[model.id] ?? fallbackModel) as TModel;

      // Extract defaults from the new model's schema
      const schemaDefaults = getSchemaDefaults(model.inputSchema);

      const selectedModel: SelectedModelData = {
        componentSchemas: model.componentSchemas,
        displayName: model.displayName,
        inputSchema: model.inputSchema,
        modelId: model.id,
        provider: model.provider,
      };

      updateNodeData<TNodeData>(nodeId, {
        model: internalModel,
        provider: model.provider,
        schemaParams: schemaDefaults,
        selectedModel,
      } as Partial<TNodeData>);
    },
    [nodeId, modelMap, fallbackModel, updateNodeData],
  );

  return { handleModelSelect };
}
