'use client';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { File, Globe, LayoutGrid, MessageSquare, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WorkspaceInspectorTabKind } from '@/lib/workspace-shell/workspace-inspector-panes.util';

type WorkspaceInspectorTabsProps = {
  readonly availableKinds: readonly WorkspaceInspectorTabKind[];
  readonly isLauncher?: boolean;
  readonly onOpenTab: (kind: WorkspaceInspectorTabKind) => void;
  readonly openKinds: readonly WorkspaceInspectorTabKind[];
};
export const WORKSPACE_INSPECTOR_TAB_ICONS = {
  browser: Globe,
  context: LayoutGrid,
  conversation: MessageSquare,
  files: File,
};
export default function WorkspaceInspectorTabs({
  availableKinds,
  isLauncher = false,
  onOpenTab,
  openKinds,
}: WorkspaceInspectorTabsProps) {
  const translate = useTranslations('common.workspaceInspector.tabs');
  const closedKinds = availableKinds.filter(
    (kind) => !openKinds.includes(kind),
  );
  const label = (kind: WorkspaceInspectorTabKind) =>
    translate(kind === 'conversation' ? 'chat' : kind);
  if (isLauncher) {
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={translate('add')}
          disabled={closedKinds.length === 0}
        >
          <Plus aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {closedKinds.map((kind) => {
          const Icon = WORKSPACE_INSPECTOR_TAB_ICONS[kind];
          return (
            <DropdownMenuItem key={kind} onSelect={() => onOpenTab(kind)}>
              <Icon aria-hidden="true" className="size-4" />
              {label(kind)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
