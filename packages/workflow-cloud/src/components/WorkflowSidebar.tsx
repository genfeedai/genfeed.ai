'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import {
  formatWorkflowRelativeTime,
  WorkflowLifecycleDot,
} from '@workflow-cloud/components/workflow-sidebar.shared';
import {
  createWorkflowApiService,
  type WorkflowSummary,
} from '@workflow-cloud/services/workflow-api';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { HiOutlinePlus } from 'react-icons/hi2';

interface WorkflowSidebarProps {
  basePath?: string;
}

/**
 * WorkflowSidebar - Persistent sidebar for workflow navigation and quick switching
 */
export function WorkflowSidebar({
  basePath = '/workflows',
}: WorkflowSidebarProps) {
  const pathname = usePathname();
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

  const activeWorkflowId = pathname.startsWith(`${basePath}/editor/`)
    ? pathname.split(`${basePath}/editor/`)[1]?.split('/')[0]
    : null;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-white/[0.08] bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <span className="text-sm font-semibold">Automations</span>
        <Link
          href={`${basePath}/editor`}
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
                href={`${basePath}/editor/${workflow._id}`}
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
    </aside>
  );
}
