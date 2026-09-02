export const WORKSPACE_INSPECTOR_ASSET_KINDS = [
  'context',
  'files',
  'browser',
] as const;

export type WorkspaceInspectorAssetKind =
  (typeof WORKSPACE_INSPECTOR_ASSET_KINDS)[number];

/**
 * The rail's product-pane accordion state. Conversation is not part of this
 * catalog — it is a fixed section pinned to the bottom of the rail and is
 * never selected, expanded, or collapsed through this layout.
 */
export type WorkspaceInspectorPaneLayout = {
  readonly expandedKinds: readonly WorkspaceInspectorAssetKind[];
};

export const WORKSPACE_INSPECTOR_PANES_STORAGE_KEY =
  'genfeed:workspace-inspector:panes';

export function isWorkspaceInspectorAssetKind(
  value: string,
): value is WorkspaceInspectorAssetKind {
  return (WORKSPACE_INSPECTOR_ASSET_KINDS as readonly string[]).includes(value);
}

export function defaultInspectorPaneLayout(): WorkspaceInspectorPaneLayout {
  return { expandedKinds: ['context'] };
}

export function resolveAvailableInspectorKinds(): readonly WorkspaceInspectorAssetKind[] {
  return WORKSPACE_INSPECTOR_ASSET_KINDS;
}

export function uniqueInspectorKinds(
  kinds: readonly WorkspaceInspectorAssetKind[],
): WorkspaceInspectorAssetKind[] {
  const seen = new Set<WorkspaceInspectorAssetKind>();
  const unique: WorkspaceInspectorAssetKind[] = [];

  for (const kind of kinds) {
    if (seen.has(kind)) {
      continue;
    }

    seen.add(kind);
    unique.push(kind);
  }

  return unique;
}

export function resolveInspectorPaneLayout(input: {
  available: readonly WorkspaceInspectorAssetKind[];
  intent: WorkspaceInspectorPaneLayout | null;
}): WorkspaceInspectorPaneLayout {
  const fallback = defaultInspectorPaneLayout();
  const source = input.intent ?? fallback;
  const expandedKinds = uniqueInspectorKinds(
    source.expandedKinds.filter((kind) => input.available.includes(kind)),
  );

  return { expandedKinds };
}

export function expandInspectorPaneKind(
  layout: WorkspaceInspectorPaneLayout,
  kind: WorkspaceInspectorAssetKind,
  available: readonly WorkspaceInspectorAssetKind[],
): WorkspaceInspectorPaneLayout {
  if (!available.includes(kind)) {
    return layout;
  }

  if (layout.expandedKinds.includes(kind)) {
    return layout;
  }

  return { expandedKinds: [...layout.expandedKinds, kind] };
}

export function collapseInspectorPaneKind(
  layout: WorkspaceInspectorPaneLayout,
  kind: WorkspaceInspectorAssetKind,
): WorkspaceInspectorPaneLayout {
  if (!layout.expandedKinds.includes(kind)) {
    return layout;
  }

  return {
    expandedKinds: layout.expandedKinds.filter((openKind) => openKind !== kind),
  };
}

export function toggleInspectorPaneKind(
  layout: WorkspaceInspectorPaneLayout,
  kind: WorkspaceInspectorAssetKind,
  available: readonly WorkspaceInspectorAssetKind[],
): WorkspaceInspectorPaneLayout {
  if (layout.expandedKinds.includes(kind)) {
    return collapseInspectorPaneKind(layout, kind);
  }

  return expandInspectorPaneKind(layout, kind, available);
}

export function parsePersistedInspectorPaneLayout(
  raw: string | null,
): WorkspaceInspectorPaneLayout | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    if (!Array.isArray(record.expandedKinds)) {
      return null;
    }

    const expandedKinds = uniqueInspectorKinds(
      record.expandedKinds.filter(
        (kind): kind is WorkspaceInspectorAssetKind =>
          typeof kind === 'string' && isWorkspaceInspectorAssetKind(kind),
      ),
    );

    return { expandedKinds };
  } catch {
    return null;
  }
}

export function serializeInspectorPaneLayout(
  layout: WorkspaceInspectorPaneLayout,
): string {
  return JSON.stringify({ expandedKinds: layout.expandedKinds });
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
