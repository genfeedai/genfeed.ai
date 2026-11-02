'use client';

import type { WorkspaceAgentContextProps } from '@props/ui/workspace-panel.props';
import { useTranslations } from 'next-intl';
import { WorkspaceContextSidebarRail } from './WorkspaceContextSidebar';

/** The page's selected record, or a hint to select one. */
export default function WorkspaceAgentContext({
  contextSidebar,
  target = 'desktop',
}: WorkspaceAgentContextProps) {
  const translate = useTranslations('common.sidePanel');
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="workspace-agent-context"
    >
      {contextSidebar?.selection ? (
        <WorkspaceContextSidebarRail
          contextSidebar={contextSidebar}
          isTopbarHosted
          target={target}
        />
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          {translate('noSelection')}
        </p>
      )}
    </div>
  );
}
