export const WORKSPACE_INSPECTOR_ASSET_KINDS = [
  'context',
  'files',
  'browser',
] as const;
export type WorkspaceInspectorAssetKind =
  (typeof WORKSPACE_INSPECTOR_ASSET_KINDS)[number];
export const WORKSPACE_INSPECTOR_TAB_KINDS = [
  ...WORKSPACE_INSPECTOR_ASSET_KINDS,
  'conversation',
] as const;
export type WorkspaceInspectorTabKind =
  (typeof WORKSPACE_INSPECTOR_TAB_KINDS)[number];
export type WorkspaceInspectorPaneLayout = {
  readonly activeKind: WorkspaceInspectorTabKind | null;
  readonly openKinds: readonly WorkspaceInspectorTabKind[];
};
export const WORKSPACE_INSPECTOR_PANES_STORAGE_KEY =
  'genfeed:workspace-inspector:tabs';
export function isWorkspaceInspectorTabKind(
  value: string,
): value is WorkspaceInspectorTabKind {
  return (WORKSPACE_INSPECTOR_TAB_KINDS as readonly string[]).includes(value);
}
export function defaultInspectorPaneLayout(): WorkspaceInspectorPaneLayout {
  return { activeKind: 'context', openKinds: ['context'] };
}
export function resolveInspectorPaneLayout(input: {
  available: readonly WorkspaceInspectorTabKind[];
  intent: WorkspaceInspectorPaneLayout | null;
}): WorkspaceInspectorPaneLayout {
  const source = input.intent ?? defaultInspectorPaneLayout();
  const openKinds = [
    ...new Set(
      source.openKinds.filter((kind) => input.available.includes(kind)),
    ),
  ];
  return {
    activeKind:
      source.activeKind && openKinds.includes(source.activeKind)
        ? source.activeKind
        : (openKinds[0] ?? null),
    openKinds,
  };
}
export function openInspectorTab(
  layout: WorkspaceInspectorPaneLayout,
  kind: WorkspaceInspectorTabKind,
): WorkspaceInspectorPaneLayout {
  return {
    activeKind: kind,
    openKinds: layout.openKinds.includes(kind)
      ? layout.openKinds
      : [...layout.openKinds, kind],
  };
}
export function parsePersistedInspectorPaneLayout(
  raw: string | null,
): WorkspaceInspectorPaneLayout | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.openKinds)) return null;
    return resolveInspectorPaneLayout({
      available: WORKSPACE_INSPECTOR_TAB_KINDS,
      intent: {
        activeKind:
          typeof record.activeKind === 'string' &&
          isWorkspaceInspectorTabKind(record.activeKind)
            ? record.activeKind
            : null,
        openKinds: record.openKinds.filter(
          (kind): kind is WorkspaceInspectorTabKind =>
            typeof kind === 'string' && isWorkspaceInspectorTabKind(kind),
        ),
      },
    });
  } catch {
    return null;
  }
}
export function serializeInspectorPaneLayout(
  layout: WorkspaceInspectorPaneLayout,
): string {
  return JSON.stringify(layout);
}

export function persistInspectorPaneLayout(
  layout: WorkspaceInspectorPaneLayout,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      WORKSPACE_INSPECTOR_PANES_STORAGE_KEY,
      serializeInspectorPaneLayout(layout),
    );
  } catch {
    // Private mode / quota — chrome still works in-session.
  }
}

export function readPersistedInspectorPaneLayout(): WorkspaceInspectorPaneLayout | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return parsePersistedInspectorPaneLayout(
      window.localStorage.getItem(WORKSPACE_INSPECTOR_PANES_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}
