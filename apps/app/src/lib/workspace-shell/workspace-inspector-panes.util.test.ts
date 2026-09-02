import {
  collapseInspectorPaneKind,
  defaultInspectorPaneLayout,
  expandInspectorPaneKind,
  isWorkspaceInspectorAssetKind,
  parsePersistedInspectorPaneLayout,
  resolveAvailableInspectorKinds,
  resolveInspectorPaneLayout,
  serializeInspectorPaneLayout,
  toggleInspectorPaneKind,
} from './workspace-inspector-panes.util';

describe('workspace inspector pane catalog', () => {
  it('recognizes catalog kinds and rejects unknown values', () => {
    expect(isWorkspaceInspectorAssetKind('context')).toBe(true);
    expect(isWorkspaceInspectorAssetKind('files')).toBe(true);
    expect(isWorkspaceInspectorAssetKind('browser')).toBe(true);
    expect(isWorkspaceInspectorAssetKind('conversation')).toBe(false);
    expect(isWorkspaceInspectorAssetKind('other')).toBe(false);
  });

  it('defaults to Context expanded and no others', () => {
    expect(defaultInspectorPaneLayout()).toEqual({
      expandedKinds: ['context'],
    });
  });

  it('always makes Context, Files, and Browser available — Conversation is not a catalog kind', () => {
    expect(resolveAvailableInspectorKinds()).toEqual([
      'context',
      'files',
      'browser',
    ]);
  });
});

describe('workspace inspector pane layout', () => {
  const available = resolveAvailableInspectorKinds();

  it('expands a kind and is a no-op for an unavailable or already-expanded kind', () => {
    const layout = defaultInspectorPaneLayout();

    expect(expandInspectorPaneKind(layout, 'files', available)).toEqual({
      expandedKinds: ['context', 'files'],
    });
    expect(expandInspectorPaneKind(layout, 'context', available)).toEqual(
      layout,
    );
    expect(expandInspectorPaneKind(layout, 'files', ['context'])).toEqual(
      layout,
    );
  });

  it('collapses an expanded kind, allowing every section to collapse at once', () => {
    const layout = { expandedKinds: ['context', 'files'] as const };

    expect(collapseInspectorPaneKind(layout, 'files')).toEqual({
      expandedKinds: ['context'],
    });
    expect(
      collapseInspectorPaneKind({ expandedKinds: ['context'] }, 'context'),
    ).toEqual({ expandedKinds: [] });
  });

  it('supports multiple simultaneously expanded kinds via toggling', () => {
    const opened = toggleInspectorPaneKind(
      defaultInspectorPaneLayout(),
      'files',
      available,
    );
    expect(opened.expandedKinds).toEqual(['context', 'files']);

    const openedAgain = toggleInspectorPaneKind(opened, 'browser', available);
    expect(openedAgain.expandedKinds).toEqual(['context', 'files', 'browser']);

    expect(
      toggleInspectorPaneKind(openedAgain, 'files', available).expandedKinds,
    ).toEqual(['context', 'browser']);
  });

  it('resolves an intent against the available kinds, falling back to the default', () => {
    expect(resolveInspectorPaneLayout({ available, intent: null })).toEqual(
      defaultInspectorPaneLayout(),
    );

    expect(
      resolveInspectorPaneLayout({
        available,
        intent: { expandedKinds: ['files', 'browser'] },
      }),
    ).toEqual({ expandedKinds: ['files', 'browser'] });

    expect(
      resolveInspectorPaneLayout({
        available: ['context', 'files'],
        intent: { expandedKinds: ['files', 'browser'] },
      }),
    ).toEqual({ expandedKinds: ['files'] });
  });

  it('round-trips a persisted layout and drops unknown kinds', () => {
    const stored = serializeInspectorPaneLayout({
      expandedKinds: ['context', 'files'],
    });

    expect(parsePersistedInspectorPaneLayout(stored)).toEqual({
      expandedKinds: ['context', 'files'],
    });
    expect(parsePersistedInspectorPaneLayout(null)).toBeNull();
    expect(parsePersistedInspectorPaneLayout('{not-json')).toBeNull();
    expect(
      parsePersistedInspectorPaneLayout(
        JSON.stringify({ expandedKinds: ['files', 'nope', 'browser'] }),
      ),
    ).toEqual({ expandedKinds: ['files', 'browser'] });
    expect(
      parsePersistedInspectorPaneLayout(JSON.stringify({ expandedKinds: [] })),
    ).toEqual({ expandedKinds: [] });
  });
});
