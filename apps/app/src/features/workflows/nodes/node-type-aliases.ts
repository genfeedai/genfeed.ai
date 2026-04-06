const API_TO_EDITOR_NODE_TYPE: Record<string, string> = {
  'ai-generate-image': 'imageGen',
  'ai-prompt-constructor': 'promptConstructor',
  'workflow-input': 'workflowInput',
  'workflow-output': 'workflowOutput',
};

const EDITOR_TO_API_NODE_TYPE = Object.fromEntries(
  Object.entries(API_TO_EDITOR_NODE_TYPE).map(([apiType, editorType]) => [
    editorType,
    apiType,
  ]),
) as Record<string, string>;

export function normalizeNodeTypeForEditor(nodeType: string): string {
  return API_TO_EDITOR_NODE_TYPE[nodeType] ?? nodeType;
}

export function normalizeNodeTypeForApi(nodeType: string): string {
  return EDITOR_TO_API_NODE_TYPE[nodeType] ?? nodeType;
}
