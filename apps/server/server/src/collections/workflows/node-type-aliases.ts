const LEGACY_TO_CANONICAL_NODE_TYPE: Record<string, string> = {
  'ai-generate-image': 'imageGen',
  'ai-prompt-constructor': 'promptConstructor',
  'workflow-input': 'workflowInput',
  'workflow-output': 'workflowOutput',
};

const CANONICAL_TO_LEGACY_NODE_TYPE = Object.fromEntries(
  Object.entries(LEGACY_TO_CANONICAL_NODE_TYPE).map(
    ([legacyType, canonicalType]) => [canonicalType, legacyType],
  ),
) as Record<string, string>;

export function normalizeWorkflowNodeTypeToCanonical(nodeType: string): string {
  return LEGACY_TO_CANONICAL_NODE_TYPE[nodeType] ?? nodeType;
}

export function normalizeWorkflowNodeTypeToLegacy(nodeType: string): string {
  return CANONICAL_TO_LEGACY_NODE_TYPE[nodeType] ?? nodeType;
}

export function isWorkflowInputNodeType(nodeType: string | undefined): boolean {
  return (
    typeof nodeType === 'string' &&
    normalizeWorkflowNodeTypeToCanonical(nodeType) === 'workflowInput'
  );
}

export function isWorkflowOutputNodeType(
  nodeType: string | undefined,
): boolean {
  return (
    typeof nodeType === 'string' &&
    normalizeWorkflowNodeTypeToCanonical(nodeType) === 'workflowOutput'
  );
}
