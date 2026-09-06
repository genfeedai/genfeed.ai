'use client';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { File, Globe, LayoutGrid, MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WorkspaceInspectorTabKind } from '@/lib/workspace-shell/workspace-inspector-panes.util';

type WorkspaceInspectorTabsProps = {
  readonly availableKinds: readonly WorkspaceInspectorTabKind[];
  readonly onOpenTab: (kind: WorkspaceInspectorTabKind) => void;
};
export const WORKSPACE_INSPECTOR_TAB_ICONS = {
  browser: Globe,
  context: LayoutGrid,
  conversation: MessageSquare,
  files: File,
};
/** Launcher shown when no pane is active yet. */
export default function WorkspaceInspectorTabs({
  availableKinds,
  onOpenTab,
}: WorkspaceInspectorTabsProps) {
  const translate = useTranslations('common.workspaceInspector.tabs');
  const label = (kind: WorkspaceInspectorTabKind) =>
    translate(kind === 'conversation' ? 'chat' : kind);
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      {availableKinds.map((kind) => {
        const Icon = WORKSPACE_INSPECTOR_TAB_ICONS[kind];
        return (
          <Button
            key={kind}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            className="h-10 justify-start gap-3 rounded-lg bg-secondary px-3"
            onClick={() => onOpenTab(kind)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label(kind)}
          </Button>
        );
      })}
    </div>
  );
}
