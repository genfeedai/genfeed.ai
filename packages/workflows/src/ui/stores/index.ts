/**
 * Store re-exports for @genfeedai/workflows/ui
 *
 * These are the actual Zustand stores used by workflows/ui components.
 * The consuming app can override behavior by:
 * - Configuring bundler aliases to point to app-specific stores
 * - Extending stores via the slice pattern
 *
 * The components in this package import from './workflow', './uiStore', etc.
 * which are re-exported here for consumers that need them.
 */

export type {
  AnnotationShape,
  AnnotationTool,
  ArrowShape,
  BaseShape,
  CircleShape,
  FreehandShape,
  RectangleShape,
  TextShape,
  ToolOptions,
} from './annotationStore';
export { useAnnotationStore } from './annotationStore';
export { type ContextMenuType, useContextMenuStore } from './contextMenuStore';
export type { DebugPayload, ExecutionStore, Job } from './execution';
export { useExecutionStore } from './execution';
export {
  configureExecutionApiBaseUrl,
  configureExecutionHeaders,
  configureExecutionHttpClient,
  getExecutionApiBaseUrl,
  getExecutionHeaders,
  getExecutionHttpClient,
  resolveExecutionApiBaseUrl,
} from './execution/executionApi';
// Embedded stores (moved from core app)
export {
  configureWorkflowLogger,
  getWorkflowLogger,
} from './executionLogger';
export { usePromptEditorStore } from './promptEditorStore';
export {
  configurePromptLibrary,
  usePromptLibraryStore,
} from './promptLibraryStore';

// Settings types
export type {
  DefaultModelSettings,
  ProviderConfig,
  ProviderSettings,
  RecentModel,
} from './settingsStore';
export {
  configureSettingsSync,
  PROVIDER_INFO,
  useSettingsStore,
} from './settingsStore';
// UI types
export type { ModalType, NodeDetailTab } from './uiStore';
export { useUIStore } from './uiStore';
// Store types
export type {
  WorkflowData,
  WorkflowPersistenceService,
  WorkflowSaveInput,
  WorkflowState,
  WorkflowStore,
  WorkflowSummary,
} from './workflow';
// Store hooks
export { useWorkflowStore } from './workflow';
export {
  configureApplyEditOperations,
  getApplyEditOperations,
} from './workflow/applyEditOperations';
// Workflow selectors
export {
  createSelectGroupByNodeId,
  createSelectIsNodeSelected,
  createSelectNodeById,
  selectAddNode,
  selectAddNodesAndEdges,
  selectCreateGroup,
  selectDeleteGroup,
  selectDuplicateNode,
  selectEdgeStyle,
  selectEdges,
  selectFindCompatibleHandle,
  selectGetConnectedNodeIds,
  selectGetNodeById,
  selectGroups,
  selectIsDirty,
  selectIsLoading,
  selectIsSaving,
  selectIsValidConnection,
  selectNavigationTargetId,
  selectNodes,
  selectOnConnect,
  selectOnEdgesChange,
  selectOnNodesChange,
  selectRemoveEdge,
  selectRemoveNode,
  selectSelectedNodeIds,
  selectSetDirty,
  selectSetSelectedNodeIds,
  selectToggleNodeLock,
  selectUnlockAllNodes,
  selectUpdateNodeData,
  selectWorkflowId,
  selectWorkflowName,
} from './workflow/selectors';
export {
  configureWorkflowPersistence,
  getWorkflowPersistence,
} from './workflow/workflowPersistence';
