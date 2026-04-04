/**
 * Hydrates nodes with schema data on workflow/template load.
 * Populates selectedModel and schemaParams for nodes that have a model but no schema.
 */
import type {
  ImageGenNodeData,
  ImageModel,
  SelectedModel,
  VideoGenNodeData,
  VideoModel,
  WorkflowNode,
} from '@genfeedai/types';
import replicateSchemas from '@genfeedai/types/replicate/schemas.json';
import { getSchemaDefaults } from './schemaUtils';

// Reverse lookup: internal model name -> Replicate model ID
const MODEL_TO_REPLICATE_ID: Record<string, string> = {
  // Image models
  'nano-banana': 'google/nano-banana',
  'nano-banana-pro': 'google/nano-banana-pro',
  'veo-3.1': 'google/veo-3.1',
  // Video models
  'veo-3.1-fast': 'google/veo-3.1-fast',
};

interface SchemaEntry {
  modelId: string;
  name: string;
  inputSchema?: Record<string, unknown>;
  componentSchemas?: Record<string, unknown>;
}

/**
 * Look up model schema by internal model name
 */
function lookupModelSchema(model: string): SelectedModel | null {
  const replicateId = MODEL_TO_REPLICATE_ID[model];
  if (!replicateId) return null;

  const schemaEntry = (replicateSchemas as SchemaEntry[]).find((s) => s.modelId === replicateId);
  if (!schemaEntry) return null;

  return {
    componentSchemas: schemaEntry.componentSchemas,
    displayName: schemaEntry.name,
    inputSchema: schemaEntry.inputSchema,
    modelId: replicateId,
    provider: 'replicate',
  };
}

/**
 * Hydrate all nodes that need schema data
 */
export function hydrateWorkflowNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.map((node) => {
    // Only hydrate imageGen and videoGen nodes
    if (node.type !== 'imageGen' && node.type !== 'videoGen') {
      return node;
    }

    const data = node.data as ImageGenNodeData | VideoGenNodeData;

    // Skip if already has selectedModel with schema
    if (data.selectedModel?.inputSchema) {
      return node;
    }

    // Skip if no model specified
    if (!data.model) {
      return node;
    }

    // Look up schema
    const selectedModel = lookupModelSchema(data.model as ImageModel | VideoModel);
    if (!selectedModel) {
      return node;
    }

    // Hydrate with selectedModel and defaults
    return {
      ...node,
      data: {
        ...data,
        schemaParams:
          data.schemaParams && Object.keys(data.schemaParams).length > 0
            ? data.schemaParams
            : getSchemaDefaults(selectedModel.inputSchema),
        selectedModel,
      },
    };
  });
}
