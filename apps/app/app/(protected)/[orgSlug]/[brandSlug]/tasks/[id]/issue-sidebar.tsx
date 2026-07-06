'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
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
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import {
  HiOutlineDocumentText,
  HiOutlineLink,
  HiOutlinePhoto,
} from 'react-icons/hi2';

type IssueSidebarProps = {
  issue: Task;
  statusColors: Record<TaskStatus, string>;
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
  statusColors,
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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
            Details
          </h3>
          <DefinitionList className="text-sm">
            <div>
              <DefinitionTerm variant="label">Status</DefinitionTerm>
              <DefinitionDetail variant="inline" className="mt-1">
                <span
                  className={cn(
                    'inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    statusColors[issue.status],
                  )}
                >
                  {statusLabels[issue.status]}
                </span>
                {statusTransitions[issue.status].length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {statusTransitions[issue.status].map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant={ButtonVariant.OUTLINE}
                        size={ButtonSize.XS}
                        className="px-1.5 py-0.5 text-[9px] text-white/50 hover:text-white/70"
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
                    href={`/tasks/${issue.parentId}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    View parent
                  </Link>
                </DefinitionDetail>
              </div>
            ) : null}
            <div>
              <DefinitionTerm variant="label">Created</DefinitionTerm>
              <DefinitionDetail variant="inline" className="text-white/50">
                {getRelativeTime(issue.createdAt)}
              </DefinitionDetail>
            </div>
            <div>
              <DefinitionTerm variant="label">Updated</DefinitionTerm>
              <DefinitionDetail variant="inline" className="text-white/50">
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
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              <HiOutlineLink className="size-3.5" />
              Linked ({issue.linkedEntities.length})
            </h3>
            <div className="space-y-2">
              {issue.linkedEntities.map((entity) => (
                <div
                  key={`${entity.entityModel}-${entity.entityId}`}
                  className="flex items-center gap-2.5 rounded border border-white/5 bg-white/[0.02] px-3 py-2"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                      entityModelColors[entity.entityModel],
                    )}
                  >
                    {entity.entityModel === 'Ingredient' ? (
                      <HiOutlinePhoto className="size-3" />
                    ) : (
                      <HiOutlineDocumentText className="size-3" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-white/60">
                      {entityModelLabels[entity.entityModel]}
                    </span>
                    <span className="block truncate text-[10px] font-mono text-white/30">
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
