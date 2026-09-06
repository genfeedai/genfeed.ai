import {
  closeInspectorTab,
  defaultInspectorPaneLayout,
  openInspectorTab,
  parsePersistedInspectorPaneLayout,
  resolveInspectorPaneLayout,
  serializeInspectorPaneLayout,
} from './workspace-inspector-panes.util';

describe('workspace inspector tabs', () => {
  it('starts with Context as the only open tab', () => {
    expect(defaultInspectorPaneLayout()).toEqual({
      activeKind: 'context',
      openKinds: ['context'],
    });
  });
  it('opens and selects a tab without duplicating it', () => {
    const layout = openInspectorTab(defaultInspectorPaneLayout(), 'files');
    expect(layout).toEqual({
      activeKind: 'files',
      openKinds: ['context', 'files'],
    });
    expect(openInspectorTab(layout, 'context')).toEqual({
      activeKind: 'context',
      openKinds: ['context', 'files'],
    });
  });
  it('closes an active tab into its neighbor and can close every tab', () => {
    const layout = openInspectorTab(
      defaultInspectorPaneLayout(),
      'conversation',
    );
    expect(closeInspectorTab(layout, 'conversation')).toEqual(
      defaultInspectorPaneLayout(),
    );
    expect(closeInspectorTab(defaultInspectorPaneLayout(), 'context')).toEqual({
      activeKind: null,
      openKinds: [],
    });
    expect(closeInspectorTab(layout, 'context')).toEqual({
      activeKind: 'conversation',
      openKinds: ['conversation'],
    });
  });
  it('filters unavailable tabs when the conversation becomes the main canvas', () => {
    expect(
      resolveInspectorPaneLayout({
        available: ['context', 'files', 'browser'],
        intent: {
          activeKind: 'conversation',
          openKinds: ['context', 'conversation'],
        },
      }),
    ).toEqual(defaultInspectorPaneLayout());
  });
  it('round-trips tabs, validates active state, and ignores obsolete accordion state', () => {
    const layout = openInspectorTab(defaultInspectorPaneLayout(), 'browser');
    expect(
      parsePersistedInspectorPaneLayout(serializeInspectorPaneLayout(layout)),
    ).toEqual(layout);
    expect(parsePersistedInspectorPaneLayout('{broken')).toBeNull();
    expect(
      parsePersistedInspectorPaneLayout('{"expandedKinds":["files"]}'),
    ).toBeNull();
    expect(
      parsePersistedInspectorPaneLayout(
        '{"openKinds":["files","bad","files"],"activeKind":"browser"}',
      ),
    ).toEqual({ activeKind: 'files', openKinds: ['files'] });
  });
});
