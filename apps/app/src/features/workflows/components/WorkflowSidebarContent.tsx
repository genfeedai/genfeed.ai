'use client';

import { Kbd } from '@genfeedai/ui';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import SidebarBackRow from '@ui/menus/sidebar-back-row/SidebarBackRow';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { HiMagnifyingGlass, HiOutlinePlus } from 'react-icons/hi2';
import {
  formatWorkflowRelativeTime,
  WorkflowLifecycleDot,
} from '@/features/workflows/components/workflow-sidebar.shared';
import {
  createWorkflowApiService,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';

interface WorkflowSidebarContentProps {
  basePath?: string;
}

/**
 * WorkflowSidebarContent - Inner content for the workflow sidebar.
 * Renders inside MenuShared's renderBody slot (no <aside> wrapper).
 * Contains the workflow header, list, and navigation links.
 */
export function WorkflowSidebarContent({
  basePath = '/workflows',
}: WorkflowSidebarContentProps) {
  const pathname = usePathname();
  const { href } = useOrgUrl();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);

  const getService = useAuthedService(
    createWorkflowApiService,
    EnvironmentService.JWT_LABEL,
  );

  const NAV_LINKS = [
    { href: basePath, label: 'Library' },
    { href: `${basePath}/templates`, label: 'Templates' },
    { href: `${basePath}/executions`, label: 'Executions' },
  ];
  const handleOpenSearch = () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
    );
  };

  const loadWorkflows = useCallback(
    async (signal: AbortSignal) => {
      try {
        const service = await getService();
        if (signal.aborted) {
          return;
        }

        const data = await service.list();
        if (signal.aborted) {
          return;
        }

        setWorkflows(data);
      } catch (err) {
        if (signal.aborted) {
          return;
        }
        logger.error('Failed to load sidebar workflows', { error: err });
      }
    },
    [getService],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadWorkflows(controller.signal);
    return () => controller.abort();
  }, [loadWorkflows]);

  const activeWorkflowId = pathname.startsWith(`${basePath}/`)
    ? pathname.slice(`${basePath}/`.length).split('/')[0]
    : null;

  return (
    <div className="flex h-full flex-col">
      <SidebarBackRow label="Automations" href={href('/overview')} />
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={handleOpenSearch}
          className="flex w-full items-center gap-3 rounded border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white/40 transition-colors duration-150 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white/60"
        >
          <HiMagnifyingGlass className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 text-left">Find...</span>
          <Kbd variant="subtle" size="xs">
            {'\u2318'}K
          </Kbd>
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <span className="text-sm font-semibold">Automations</span>
        <Link
          href={`${basePath}/new`}
          className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="New Workflow"
        >
          <HiOutlinePlus className="h-4 w-4" />
        </Link>
      </div>

      {/* Workflow list */}
      <div className="flex-1 overflow-y-auto py-1">
        {workflows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No workflows yet
          </div>
        ) : (
          workflows.map((workflow) => {
            const isActive = activeWorkflowId === workflow._id;
            return (
              <Link
                key={workflow._id}
                href={`${basePath}/${workflow._id}`}
                className={`flex items-start gap-2.5 px-4 py-2.5 transition-colors ${
                  isActive ? 'bg-white/10' : 'hover:bg-white/[0.04]'
                } ${workflow.lifecycle === 'archived' ? 'opacity-50' : ''}`}
              >
                <WorkflowLifecycleDot lifecycle={workflow.lifecycle} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {workflow.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatWorkflowRelativeTime(workflow.updatedAt)}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Navigation */}
      <div className="border-t border-white/[0.08] py-2">
        {NAV_LINKS.map((link) => {
          const isActive =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`block px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
