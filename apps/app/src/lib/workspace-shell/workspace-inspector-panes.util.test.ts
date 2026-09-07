import {
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
