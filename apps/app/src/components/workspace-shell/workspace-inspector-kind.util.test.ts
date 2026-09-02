import {
  inspectorContextPaneClassName,
  isAgentOwnedInspector,
  isInspectorComposerOwner,
  resolveWorkspaceInspectorBodyKind,
  resolveWorkspaceInspectorPaneKind,
  shouldShowInspectorOverlayPreview,
} from './workspace-inspector-kind.util';

describe('resolveWorkspaceInspectorPaneKind', () => {
  it('prefers a product surface adapter over agent chrome', () => {
    expect(
      resolveWorkspaceInspectorPaneKind({
        hasProductSurfaceAdapter: true,
        isAgentOwned: true,
        isAgentRoute: true,
      }),
    ).toBe('product-surface');
  });

  it('suppresses generic context when the agent owns the inspector', () => {
    expect(
      resolveWorkspaceInspectorPaneKind({
        hasProductSurfaceAdapter: false,
        isAgentOwned: true,
        isAgentRoute: true,
      }),
    ).toBe('suppressed-agent');
  });

  it('shows the empty agent body on /agent without a projected panel', () => {
    expect(
      resolveWorkspaceInspectorPaneKind({
        hasProductSurfaceAdapter: false,
        isAgentOwned: false,
        isAgentRoute: true,
      }),
    ).toBe('empty-agent');
  });

  it('falls through to workspace body off the agent route', () => {
    expect(
      resolveWorkspaceInspectorPaneKind({
        hasProductSurfaceAdapter: false,
        isAgentOwned: false,
        isAgentRoute: false,
      }),
    ).toBe('workspace-body');
  });
});

describe('resolveWorkspaceInspectorBodyKind', () => {
  const none = {
    hasEffectiveSurfaceAdapter: false,
    hasPresentationAdapter: false,
    hasResearchAdapter: false,
    hasWorkspaceAdapter: false,
    isWorkflowInspectorSurface: false,
  };

  it('walks the registered inspector adapters in precedence order', () => {
    expect(
      resolveWorkspaceInspectorBodyKind({
        ...none,
        isWorkflowInspectorSurface: true,
      }),
    ).toBe('workflow');
    expect(
      resolveWorkspaceInspectorBodyKind({
        ...none,
        hasEffectiveSurfaceAdapter: true,
      }),
    ).toBe('surface-adapter');
    expect(
      resolveWorkspaceInspectorBodyKind({
        ...none,
        hasResearchAdapter: true,
      }),
    ).toBe('research-adapter');
    expect(
      resolveWorkspaceInspectorBodyKind({
        ...none,
        hasPresentationAdapter: true,
      }),
    ).toBe('presentation-adapter');
    expect(
      resolveWorkspaceInspectorBodyKind({
        ...none,
        hasWorkspaceAdapter: true,
      }),
    ).toBe('workspace-adapter');
    expect(resolveWorkspaceInspectorBodyKind(none)).toBe('empty');
  });
});

describe('shouldShowInspectorOverlayPreview', () => {
  it('hides the overlay preview when a surface already owns the pane', () => {
    expect(
      shouldShowInspectorOverlayPreview({
        hasEffectiveSurfaceAdapter: true,
        hasPresentationAdapter: false,
      }),
    ).toBe(false);
    expect(
      shouldShowInspectorOverlayPreview({
        hasEffectiveSurfaceAdapter: false,
        hasPresentationAdapter: false,
      }),
    ).toBe(true);
  });
});

describe('inspector chrome helpers', () => {
  it('owns the inspector only when a portal slot and panel both exist', () => {
    expect(isAgentOwnedInspector(true, true)).toBe(true);
    expect(isAgentOwnedInspector(true, false)).toBe(false);
    expect(isAgentOwnedInspector(false, true)).toBe(false);
  });

  it('owns the composer only when a conversation slot is mounted off overlay', () => {
    expect(isInspectorComposerOwner(true, false)).toBe(true);
    expect(isInspectorComposerOwner(true, true)).toBe(false);
    expect(isInspectorComposerOwner(false, false)).toBe(false);
  });

  it('pads the generic context pane only when no adapter owns it', () => {
    expect(inspectorContextPaneClassName(true, false)).not.toContain(
      'gap-3 p-3',
    );
    expect(inspectorContextPaneClassName(false, true)).not.toContain(
      'gap-3 p-3',
    );
    expect(inspectorContextPaneClassName(false, false)).toContain('gap-3 p-3');
  });
});
