export const WORKSPACE_INSPECTOR_ASSET_KINDS = [
  'context',
  'conversation',
  'files',
  'browser',
] as const;

export type WorkspaceInspectorAssetKind =
  (typeof WORKSPACE_INSPECTOR_ASSET_KINDS)[number];

export type WorkspaceInspectorTabLayout = {
  readonly activeKind: WorkspaceInspectorAssetKind;
  readonly openKinds: readonly WorkspaceInspectorAssetKind[];
};

export const WORKSPACE_INSPECTOR_TABS_STORAGE_KEY =
  'genfeed:workspace-inspector:tabs';

export function isWorkspaceInspectorAssetKind(
  value: string,
): value is WorkspaceInspectorAssetKind {
  return (WORKSPACE_INSPECTOR_ASSET_KINDS as readonly string[]).includes(value);
}

export function inspectorTabFromValue(
  value: string,
): WorkspaceInspectorAssetKind {
  return isWorkspaceInspectorAssetKind(value) ? value : 'context';
}

export function defaultInspectorTabLayout(
  hasConversationSlot: boolean,
): WorkspaceInspectorTabLayout {
  if (hasConversationSlot) {
    return {
      activeKind: 'context',
      openKinds: ['context', 'conversation'],
    };
  }

  return {
    activeKind: 'context',
    openKinds: ['context'],
  };
}

export function resolveAvailableInspectorKinds(input: {
  hasConversationSlot: boolean;
}): readonly WorkspaceInspectorAssetKind[] {
  if (input.hasConversationSlot) {
    return WORKSPACE_INSPECTOR_ASSET_KINDS;
  }

  return WORKSPACE_INSPECTOR_ASSET_KINDS.filter(
    (kind) => kind !== 'conversation',
  );
}

export function pinnedInspectorKinds(input: {
  hasConversationSlot: boolean;
  isComposerOwner: boolean;
}): readonly WorkspaceInspectorAssetKind[] {
  if (input.isComposerOwner && input.hasConversationSlot) {
    return ['conversation'];
  }

  return [];
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

export function canCloseInspectorKind(input: {
  isComposerOwner: boolean;
  kind: WorkspaceInspectorAssetKind;
  openKinds: readonly WorkspaceInspectorAssetKind[];
}): boolean {
  if (!input.openKinds.includes(input.kind)) {
    return false;
  }

  if (input.openKinds.length <= 1) {
    return false;
  }

  if (input.kind === 'conversation' && input.isComposerOwner) {
    return false;
  }

  return true;
}

export function resolveInspectorTabLayout(input: {
  available: readonly WorkspaceInspectorAssetKind[];
  hasConversationSlot: boolean;
  intent: WorkspaceInspectorTabLayout | null;
  isComposerOwner: boolean;
}): WorkspaceInspectorTabLayout {
  const fallback = defaultInspectorTabLayout(input.hasConversationSlot);
  const source = input.intent ?? fallback;
  const availableOpenKinds = source.openKinds.filter((kind) =>
    input.available.includes(kind),
  );
  const withPinned = uniqueInspectorKinds([
    ...availableOpenKinds,
    ...pinnedInspectorKinds({
      hasConversationSlot: input.hasConversationSlot,
      isComposerOwner: input.isComposerOwner,
    }).filter((kind) => input.available.includes(kind)),
  ]);
  const openKinds =
    withPinned.length > 0
      ? withPinned
      : fallback.openKinds.filter((kind) => input.available.includes(kind));
  const activeKind = openKinds.includes(source.activeKind)
    ? source.activeKind
    : (openKinds[0] ?? 'context');

  return { activeKind, openKinds };
}

export function openInspectorKind(
  layout: WorkspaceInspectorTabLayout,
  kind: WorkspaceInspectorAssetKind,
  available: readonly WorkspaceInspectorAssetKind[],
): WorkspaceInspectorTabLayout {
  if (!available.includes(kind)) {
    return layout;
  }

  if (layout.openKinds.includes(kind)) {
    return {
      activeKind: kind,
      openKinds: layout.openKinds,
    };
  }

  return {
    activeKind: kind,
    openKinds: [...layout.openKinds, kind],
  };
}

export function closeInspectorKind(
  layout: WorkspaceInspectorTabLayout,
  kind: WorkspaceInspectorAssetKind,
  isComposerOwner: boolean,
): WorkspaceInspectorTabLayout {
  if (
    !canCloseInspectorKind({
      isComposerOwner,
      kind,
      openKinds: layout.openKinds,
    })
  ) {
    return layout;
  }

  const closedIndex = layout.openKinds.indexOf(kind);
  const openKinds = layout.openKinds.filter((openKind) => openKind !== kind);
  const nextActive =
    layout.activeKind === kind
      ? (openKinds[Math.max(0, closedIndex - 1)] ?? openKinds[0] ?? 'context')
      : layout.activeKind;

  return {
    activeKind: nextActive,
    openKinds,
  };
}

export function toggleInspectorKind(
  layout: WorkspaceInspectorTabLayout,
  kind: WorkspaceInspectorAssetKind,
  available: readonly WorkspaceInspectorAssetKind[],
  isComposerOwner: boolean,
): WorkspaceInspectorTabLayout {
  if (layout.openKinds.includes(kind)) {
    return closeInspectorKind(layout, kind, isComposerOwner);
  }

  return openInspectorKind(layout, kind, available);
}

export function parsePersistedInspectorTabLayout(
  raw: string | null,
): WorkspaceInspectorTabLayout | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    if (!Array.isArray(record.openKinds)) {
      return null;
    }

    const openKinds = uniqueInspectorKinds(
      record.openKinds.filter(
        (kind): kind is WorkspaceInspectorAssetKind =>
          typeof kind === 'string' && isWorkspaceInspectorAssetKind(kind),
      ),
    );

    if (openKinds.length === 0) {
      return null;
    }

    const activeKind =
      typeof record.activeKind === 'string' &&
      isWorkspaceInspectorAssetKind(record.activeKind) &&
      openKinds.includes(record.activeKind)
        ? record.activeKind
        : (openKinds[0] ?? 'context');

    return { activeKind, openKinds };
  } catch {
    return null;
  }
}

export function serializeInspectorTabLayout(
  layout: WorkspaceInspectorTabLayout,
): string {
  return JSON.stringify({
    activeKind: layout.activeKind,
    openKinds: layout.openKinds,
  });
}

export function persistInspectorTabLayout(
  layout: WorkspaceInspectorTabLayout,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      WORKSPACE_INSPECTOR_TABS_STORAGE_KEY,
      serializeInspectorTabLayout(layout),
    );
  } catch {
    // Private mode / quota — chrome still works in-session.
  }
}

export function readPersistedInspectorTabLayout(): WorkspaceInspectorTabLayout | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return parsePersistedInspectorTabLayout(
      window.localStorage.getItem(WORKSPACE_INSPECTOR_TABS_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}
