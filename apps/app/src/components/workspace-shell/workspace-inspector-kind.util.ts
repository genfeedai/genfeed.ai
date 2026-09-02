export type WorkspaceInspectorPaneKind =
  | 'empty-agent'
  | 'product-surface'
  | 'suppressed-agent'
  | 'workspace-body';

export type WorkspaceInspectorBodyKind =
  | 'empty'
  | 'presentation-adapter'
  | 'research-adapter'
  | 'surface-adapter'
  | 'workflow'
  | 'workspace-adapter';

export function resolveWorkspaceInspectorPaneKind(input: {
  hasProductSurfaceAdapter: boolean;
  isAgentOwned: boolean;
  isAgentRoute: boolean;
}): WorkspaceInspectorPaneKind {
  if (input.hasProductSurfaceAdapter) {
    return 'product-surface';
  }

  if (input.isAgentOwned && input.isAgentRoute) {
    return 'suppressed-agent';
  }

  if (input.isAgentRoute) {
    return 'empty-agent';
  }

  return 'workspace-body';
}

export function resolveWorkspaceInspectorBodyKind(input: {
  hasEffectiveSurfaceAdapter: boolean;
  hasPresentationAdapter: boolean;
  hasResearchAdapter: boolean;
  hasWorkspaceAdapter: boolean;
  isWorkflowInspectorSurface: boolean;
}): WorkspaceInspectorBodyKind {
  if (input.isWorkflowInspectorSurface) {
    return 'workflow';
  }

  if (input.hasEffectiveSurfaceAdapter) {
    return 'surface-adapter';
  }

  return resolveFallbackInspectorBodyKind(input);
}

function resolveFallbackInspectorBodyKind(input: {
  hasPresentationAdapter: boolean;
  hasResearchAdapter: boolean;
  hasWorkspaceAdapter: boolean;
}): WorkspaceInspectorBodyKind {
  if (input.hasResearchAdapter) {
    return 'research-adapter';
  }

  if (input.hasPresentationAdapter) {
    return 'presentation-adapter';
  }

  if (input.hasWorkspaceAdapter) {
    return 'workspace-adapter';
  }

  return 'empty';
}

export function shouldShowInspectorOverlayPreview(input: {
  hasEffectiveSurfaceAdapter: boolean;
  hasPresentationAdapter: boolean;
}): boolean {
  return !input.hasEffectiveSurfaceAdapter && !input.hasPresentationAdapter;
}

export function isAgentOwnedInspector(
  hasAgentPanelSlot: boolean,
  hasAgentInspectorPanel: boolean,
): boolean {
  return hasAgentPanelSlot && hasAgentInspectorPanel;
}

export function isInspectorComposerOwner(
  hasConversationSlot: boolean,
  isOverlayState: boolean,
): boolean {
  return hasConversationSlot && !isOverlayState;
}

const INSPECTOR_CONTEXT_PANE_BASE_CLASS =
  'mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto';

export function inspectorContextPaneClassName(
  hasProductSurfaceAdapter: boolean,
  isAgentOwned: boolean,
): string {
  if (hasProductSurfaceAdapter) {
    return INSPECTOR_CONTEXT_PANE_BASE_CLASS;
  }

  if (isAgentOwned) {
    return INSPECTOR_CONTEXT_PANE_BASE_CLASS;
  }

  return `${INSPECTOR_CONTEXT_PANE_BASE_CLASS} gap-3 p-3`;
}
