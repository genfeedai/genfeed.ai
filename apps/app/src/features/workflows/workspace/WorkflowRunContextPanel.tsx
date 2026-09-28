'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import { useAgentChatStore } from '@genfeedai/agent';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo } from 'react';
import { WorkflowSurfaceInspector } from './WorkflowSurfaceInspector';
import { resolveWorkflowSurfaceRoute } from './workflow-surface-routing';

/**
 * Registers the workflow or run a workflow route points at as the context
 * sidebar's selection. It starts closed: the canvas is the work, and the
 * topbar toggle opens inputs, approvals, schedule and provenance on demand.
 */
function WorkflowRunContextPanelContent() {
  const translate = useTranslations('common.contextSidebar');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const route = useMemo(
    () =>
      resolveWorkflowSurfaceRoute(
        pathname,
        new URLSearchParams(searchParamsString),
      ),
    [pathname, searchParamsString],
  );
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const contextVersion = useAgentChatStore(
    (state) =>
      state.threads.find((thread) => thread.id === state.activeThreadId)
        ?.contextVersion,
  );
  const selectedId = route.executionId ?? route.workflowId;

  return (
    <ContextSidebarPanel
      selection={
        route.workflowBaseHref && selectedId
          ? {
              id: selectedId,
              isOpenByDefault: false,
              kind: 'run',
              origin: 'automatic',
              title: route.executionId
                ? translate('workflowRun')
                : translate('workflow'),
            }
          : null
      }
    >
      <div className="px-4 py-4">
        <WorkflowSurfaceInspector
          contextVersion={contextVersion}
          pathname={pathname}
          searchParams={new URLSearchParams(searchParamsString)}
          threadId={activeThreadId}
        />
      </div>
    </ContextSidebarPanel>
  );
}

export function WorkflowRunContextPanel() {
  return (
    <Suspense fallback={null}>
      <WorkflowRunContextPanelContent />
    </Suspense>
  );
}
