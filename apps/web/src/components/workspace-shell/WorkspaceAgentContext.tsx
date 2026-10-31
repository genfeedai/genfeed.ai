'use client';

import type { WorkspaceAgentContextProps } from '@props/ui/workspace-panel.props';
import { useTranslations } from 'next-intl';
import { WorkspaceContextSidebarRail } from './WorkspaceContextSidebar';

/** Current send context and the page's existing selected-record details. */
export default function WorkspaceAgentContext({
  contextSidebar,
  pageLabel,
  referenceCount,
  scopeLabel,
  target = 'desktop',
}: WorkspaceAgentContextProps) {
  const translate = useTranslations('common.sidePanel');
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="workspace-agent-context"
    >
      <div className="shrink-0 space-y-4 px-4 py-4">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="mb-1 text-xs text-muted-foreground">
              {translate('currentPage')}
            </dt>
            <dd>{pageLabel}</dd>
          </div>
          <div>
            <dt className="mb-1 text-xs text-muted-foreground">
              {translate('scope')}
            </dt>
            <dd>{scopeLabel}</dd>
          </div>
        </dl>
        {referenceCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            {translate('selectedRecords', { count: referenceCount })}
          </p>
        ) : !contextSidebar?.selection ? (
          <p className="text-sm text-muted-foreground">
            {translate('noSelection')}
          </p>
        ) : null}
      </div>
      {contextSidebar?.selection ? (
        <WorkspaceContextSidebarRail
          contextSidebar={contextSidebar}
          isTopbarHosted
          target={target}
        />
      ) : null}
    </div>
  );
}
