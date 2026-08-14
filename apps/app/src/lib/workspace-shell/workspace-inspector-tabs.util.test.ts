import {
  canCloseInspectorKind,
  closeInspectorKind,
  defaultInspectorTabLayout,
  isWorkspaceInspectorAssetKind,
  openInspectorKind,
  parsePersistedInspectorTabLayout,
  pinnedInspectorKinds,
  resolveAvailableInspectorKinds,
  resolveInspectorTabLayout,
  serializeInspectorTabLayout,
  toggleInspectorKind,
} from './workspace-inspector-tabs.util';

describe('workspace inspector tab catalog', () => {
  it('recognizes catalog kinds and rejects unknown values', () => {
    expect(isWorkspaceInspectorAssetKind('context')).toBe(true);
    expect(isWorkspaceInspectorAssetKind('files')).toBe(true);
    expect(isWorkspaceInspectorAssetKind('browser')).toBe(true);
    expect(isWorkspaceInspectorAssetKind('other')).toBe(false);
  });

  it('defaults to Context, then Conversation when the inspector hosts a thread', () => {
    expect(defaultInspectorTabLayout(true)).toEqual({
      activeKind: 'context',
      openKinds: ['context', 'conversation'],
    });
    expect(defaultInspectorTabLayout(false)).toEqual({
      activeKind: 'context',
      openKinds: ['context'],
    });
  });

  it('hides Conversation from the catalog when the inspector does not host it', () => {
    expect(
      resolveAvailableInspectorKinds({ hasConversationSlot: false }),
    ).toEqual(['context', 'files', 'browser']);
    expect(
      resolveAvailableInspectorKinds({ hasConversationSlot: true }),
    ).toEqual(['context', 'conversation', 'files', 'browser']);
  });
});

describe('workspace inspector tab layout', () => {
  const productAvailable = resolveAvailableInspectorKinds({
    hasConversationSlot: true,
  });

  it('opens a kind, focuses it, and is a no-op for unavailable kinds', () => {
    const layout = defaultInspectorTabLayout(true);

    expect(openInspectorKind(layout, 'files', productAvailable)).toEqual({
      activeKind: 'files',
      openKinds: ['context', 'conversation', 'files'],
    });
    expect(openInspectorKind(layout, 'conversation', productAvailable)).toEqual(
      {
        activeKind: 'conversation',
        openKinds: ['context', 'conversation'],
      },
    );
    expect(
      openInspectorKind(layout, 'conversation', ['context', 'files']),
    ).toEqual(layout);
  });

  it('pins Conversation while the inspector owns the composer', () => {
    expect(
      pinnedInspectorKinds({
        hasConversationSlot: true,
        isComposerOwner: true,
      }),
    ).toEqual(['conversation']);
    expect(
      canCloseInspectorKind({
        isComposerOwner: true,
        kind: 'conversation',
        openKinds: ['context', 'conversation'],
      }),
    ).toBe(false);
    expect(
      canCloseInspectorKind({
        isComposerOwner: false,
        kind: 'context',
        openKinds: ['context'],
      }),
    ).toBe(false);
  });

  it('closes the active tab onto its neighbor and refuses pinned or last tabs', () => {
    const layout = {
      activeKind: 'files' as const,
      openKinds: ['context', 'files', 'browser'] as const,
    };

    expect(closeInspectorKind(layout, 'files', false)).toEqual({
      activeKind: 'context',
      openKinds: ['context', 'browser'],
    });
    expect(
      closeInspectorKind(
        { activeKind: 'conversation', openKinds: ['context', 'conversation'] },
        'conversation',
        true,
      ),
    ).toEqual({
      activeKind: 'conversation',
      openKinds: ['context', 'conversation'],
    });
  });

  it('toggles addable kinds and restores pinned Conversation into a stored layout', () => {
    const withoutConversation = {
      activeKind: 'files' as const,
      openKinds: ['files'] as const,
    };

    expect(
      resolveInspectorTabLayout({
        available: productAvailable,
        hasConversationSlot: true,
        intent: withoutConversation,
        isComposerOwner: true,
      }),
    ).toEqual({
      activeKind: 'files',
      openKinds: ['files', 'conversation'],
    });

    const opened = toggleInspectorKind(
      defaultInspectorTabLayout(true),
      'browser',
      productAvailable,
      true,
    );
    expect(opened.openKinds).toContain('browser');
    expect(
      toggleInspectorKind(opened, 'browser', productAvailable, true).openKinds,
    ).not.toContain('browser');
  });

  it('round-trips a persisted layout and drops unknown kinds', () => {
    const stored = serializeInspectorTabLayout({
      activeKind: 'files',
      openKinds: ['context', 'files'],
    });

    expect(parsePersistedInspectorTabLayout(stored)).toEqual({
      activeKind: 'files',
      openKinds: ['context', 'files'],
    });
    expect(parsePersistedInspectorTabLayout(null)).toBeNull();
    expect(parsePersistedInspectorTabLayout('{not-json')).toBeNull();
    expect(
      parsePersistedInspectorTabLayout(
        JSON.stringify({
          activeKind: 'files',
          openKinds: ['files', 'nope', 'browser'],
        }),
      ),
    ).toEqual({
      activeKind: 'files',
      openKinds: ['files', 'browser'],
    });
  });
});
