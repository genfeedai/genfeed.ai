'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Workflow } from '@models/automation/workflow.model';
import { useConfirmDeleteModal } from '@providers/global-modals/global-modals.provider';
import { WorkflowsService } from '@services/automation/workflows.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { Dropdown } from '@ui/primitives/dropdown';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  HiEllipsisVertical,
  HiOutlineClipboardDocumentList,
  HiPencil,
  HiTrash,
} from 'react-icons/hi2';

const WORKFLOW_SKELETON_KEYS = [
  'workflow-skeleton-1',
  'workflow-skeleton-2',
  'workflow-skeleton-3',
  'workflow-skeleton-4',
] as const;

function getWorkflowStatusVariant(
  status: string,
): 'success' | 'ghost' | 'warning' | 'info' | 'error' {
  switch (status) {
    case 'running':
    case 'active':
      return 'success';
    case 'draft':
      return 'ghost';
    case 'paused':
    case 'inactive':
      return 'warning';
    case 'completed':
    case 'failed':
      return 'info';
    default:
      return 'error';
  }
}

export default function WorkflowsPage() {
  const getWorkflowsService = useAuthedService((token: string) =>
    WorkflowsService.getInstance(token),
  );
  const notificationsService = NotificationsService.getInstance();
  const { openConfirmDelete } = useConfirmDeleteModal();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadWorkflows = useCallback(
    async (refresh: boolean = false) => {
      if (!refresh) {
        setIsLoading(true);
      }

      setIsRefreshing(refresh);

      try {
        const service = await getWorkflowsService();
        const fetchedWorkflows = await service.findAll({
          pagination: false,
          sort: 'createdAt: -1',
        });

        setWorkflows(fetchedWorkflows);
        logger.info('Loaded workflows', { count: fetchedWorkflows.length });
      } catch (error) {
        logger.error('Failed to load workflows', error);
        notificationsService.error('Failed to load workflows');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [getWorkflowsService, notificationsService],
  );

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const handleDelete = useCallback(
    (workflow: Workflow) => {
      openConfirmDelete({
        entity: {
          id: workflow.id,
          label: workflow.label || 'Untitled Workflow',
        },
        entityName: 'workflow',
        onConfirm: async () => {
          try {
            const service = await getWorkflowsService();
            await service.delete(workflow.id);

            setWorkflows((prev) => prev.filter((w) => w.id !== workflow.id));
            notificationsService.success('Workflow deleted');
          } catch (error) {
            logger.error('Failed to delete workflow', error);
            notificationsService.error('Failed to delete workflow');
          }
        },
      });
    },
    [openConfirmDelete, getWorkflowsService, notificationsService],
  );

  if (isLoading) {
    return (
      <Container
        label="Workflows"
        description="Create multi-step automation pipelines for content generation and publishing"
        icon={HiOutlineClipboardDocumentList}
      >
        <div className="grid gap-4">
          {WORKFLOW_SKELETON_KEYS.map((key) => (
            <SkeletonCard key={key} showImage={false} />
          ))}
        </div>
      </Container>
    );
  }

  return (
    <Container
      label="Workflows"
      description="Create multi-step automation pipelines for content generation and publishing"
      icon={HiOutlineClipboardDocumentList}
      right=<ButtonRefresh
        onClick={() => loadWorkflows(true)}
        isRefreshing={isRefreshing}
      />
    >
      <WorkspaceSurface
        title="Automation Workflows"
        tone="muted"
        data-testid="automation-workflows-surface"
      >
        <div className="grid gap-4">
          {workflows.length === 0 ? (
            <CardEmpty label="No workflows found" />
          ) : (
            workflows.map((workflow: Workflow) => (
              <Card key={workflow.id}>
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="card-label text-lg">{workflow.label}</h3>
                        <Badge
                          variant={getWorkflowStatusVariant(workflow.status)}
                        >
                          {workflow.status}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {workflow.trigger}
                        </Badge>
                      </div>

                      {workflow.description && (
                        <p className="text-foreground/70 mb-3">
                          {workflow.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-sm text-foreground/60 mb-3">
                        {workflow.createdAt && (
                          <span>
                            Created:{' '}
                            {new Date(workflow.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <Dropdown
                      trigger={
                        <Button
                          variant={ButtonVariant.GHOST}
                          size={ButtonSize.ICON}
                        >
                          <HiEllipsisVertical className="w-4 h-4" />
                        </Button>
                      }
                      usePortal
                    >
                      <ul className="menu p-0">
                        <li>
                          <Button asChild variant={ButtonVariant.SOFT}>
                            <Link href={`/workflows/${workflow.id}`}>
                              <HiPencil className="w-4 h-4" />
                              View/Edit
                            </Link>
                          </Button>
                        </li>
                        <li>
                          <Button
                            variant={ButtonVariant.UNSTYLED}
                            withWrapper={false}
                            className="text-error"
                            onClick={() => handleDelete(workflow)}
                          >
                            <HiTrash className="w-4 h-4" />
                            Delete
                          </Button>
                        </li>
                      </ul>
                    </Dropdown>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </WorkspaceSurface>
    </Container>
  );
}
