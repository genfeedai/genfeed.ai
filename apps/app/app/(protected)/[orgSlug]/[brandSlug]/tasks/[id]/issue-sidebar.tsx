'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { cn } from '@helpers/formatting/cn/cn.util';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import type {
  Task,
  TaskLinkedEntityModel,
  TaskPriority,
  TaskStatus,
} from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { FileText, Image, LinkIcon } from 'lucide-react';
import Link from 'next/link';

type IssueSidebarProps = {
  issue: Task;
  statusLabels: Record<TaskStatus, string>;
  statusTransitions: Record<TaskStatus, TaskStatus[]>;
  priorityColors: Record<TaskPriority, string>;
  priorityLabels: Record<TaskPriority, string>;
  entityModelColors: Record<TaskLinkedEntityModel, string>;
  entityModelLabels: Record<TaskLinkedEntityModel, string>;
  onStatusUpdate: (newStatus: TaskStatus) => Promise<void>;
};

export default function IssueSidebar({
  issue,
  statusLabels,
  statusTransitions,
  priorityColors,
  priorityLabels,
  entityModelColors,
  entityModelLabels,
  onStatusUpdate,
}: IssueSidebarProps) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-800">
            Details
          </h3>
          <DefinitionList className="text-sm">
            <div>
              <DefinitionTerm variant="label">Status</DefinitionTerm>
              <DefinitionDetail variant="inline" className="mt-1">
                <Badge status={issue.status} size={ComponentSize.SM}>
                  {statusLabels[issue.status]}
                </Badge>
                {statusTransitions[issue.status].length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {statusTransitions[issue.status].map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant={ButtonVariant.SECONDARY}
                        size={ButtonSize.XS}
                        className="px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground"
                        onClick={() => onStatusUpdate(s)}
                      >
                        {statusLabels[s]}
                      </Button>
                    ))}
                  </div>
                )}
              </DefinitionDetail>
            </div>
            <div>
              <DefinitionTerm variant="label">Priority</DefinitionTerm>
              <DefinitionDetail
                variant="inline"
                className={priorityColors[issue.priority]}
              >
                {priorityLabels[issue.priority]}
              </DefinitionDetail>
            </div>
            {issue.parentId ? (
              <div>
                <DefinitionTerm variant="label">Parent Issue</DefinitionTerm>
                <DefinitionDetail variant="inline">
                  <Link
                    href={`${APP_ROUTES.WORKSPACE.TASKS}/${issue.parentId}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    View parent
                  </Link>
                </DefinitionDetail>
              </div>
            ) : null}
            <div>
              <DefinitionTerm variant="label">Created</DefinitionTerm>
              <DefinitionDetail
                variant="inline"
                className="text-muted-foreground"
              >
                {getRelativeTime(issue.createdAt)}
              </DefinitionDetail>
            </div>
            <div>
              <DefinitionTerm variant="label">Updated</DefinitionTerm>
              <DefinitionDetail
                variant="inline"
                className="text-muted-foreground"
              >
                {getRelativeTime(issue.updatedAt)}
              </DefinitionDetail>
            </div>
            {issue.checkoutAgentId ? (
              <div>
                <DefinitionTerm variant="label">Checked Out By</DefinitionTerm>
                <DefinitionDetail variant="inline" className="text-blue-400">
                  Agent
                </DefinitionDetail>
              </div>
            ) : null}
          </DefinitionList>
        </div>
      </Card>

      {issue.linkedEntities?.length > 0 ? (
        <Card>
          <div className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-800">
              <LinkIcon className="size-3.5" />
              Linked ({issue.linkedEntities.length})
            </h3>
            <div className="space-y-2">
              {issue.linkedEntities.map((entity) => (
                <div
                  key={`${entity.entityModel}-${entity.entityId}`}
                  className="flex items-center gap-2.5 rounded border border-border bg-card/60 px-3 py-2"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                      entityModelColors[entity.entityModel],
                    )}
                  >
                    {entity.entityModel === 'Ingredient' ? (
                      <Image className="size-3" />
                    ) : (
                      <FileText className="size-3" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-muted-foreground">
                      {entityModelLabels[entity.entityModel]}
                    </span>
                    <span className="block truncate text-2xs font-mono text-gray-800">
                      {entity.entityId}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
