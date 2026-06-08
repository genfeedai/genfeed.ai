'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { Task } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import {
  getWorkspaceLinkedOutputDescription,
  getWorkspaceLinkedOutputTitle,
  type WorkspaceTaskLinkedOutputSummary,
  type WorkspaceTaskOutputGroup,
} from './workspace-task-inspector-helpers';

interface WorkspaceTaskOutputsCardProps {
  approvedOutputIds: string[];
  isBusy: boolean;
  linkedOutputGroups: WorkspaceTaskOutputGroup[];
  linkedOutputSummary: WorkspaceTaskLinkedOutputSummary;
  onKeepOutput: (taskId: string, outputId: string) => Promise<void>;
  onTrashOutput: (taskId: string, outputId: string) => Promise<void>;
  onUnkeepOutput: (taskId: string, outputId: string) => Promise<void>;
  taskId: string;
  outputType: Task['outputType'];
}

export function WorkspaceTaskOutputsCard({
  approvedOutputIds,
  isBusy,
  linkedOutputGroups,
  linkedOutputSummary,
  onKeepOutput,
  onTrashOutput,
  onUnkeepOutput,
  taskId,
  outputType,
}: WorkspaceTaskOutputsCardProps) {
  return (
    <Card
      label="Generated outputs"
      bodyClassName="space-y-3 border-l border-emerald-400/25 p-4 text-sm text-foreground/75"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground/70">
          Review all active variants here. Kept outputs stay visible; trashed
          variants disappear from the thread.
        </p>
        <Button
          asChild
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          className="font-semibold"
        >
          <Link href="/library/ingredients">Open library</Link>
        </Button>
      </div>

      {linkedOutputSummary.isLoading ? <p>Loading linked outputs…</p> : null}

      {linkedOutputSummary.error ? (
        <p className="text-amber-200">{linkedOutputSummary.error}</p>
      ) : null}

      {linkedOutputGroups.length > 0 ? (
        <div className="space-y-3" data-testid="workspace-task-linked-outputs">
          {linkedOutputGroups.map((group) => {
            const outputs = [group.root, ...group.children];
            return (
              <article
                key={group.root.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">
                    {getWorkspaceLinkedOutputTitle(group.root)}
                  </p>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                    {outputs.length} variant{outputs.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="space-y-3">
                  {outputs.map((output) => {
                    const description =
                      getWorkspaceLinkedOutputDescription(output);
                    const isKept = approvedOutputIds.includes(output.id);

                    return (
                      <div
                        key={output.id}
                        className="rounded-lg border border-white/10 bg-black/30 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">
                              {getWorkspaceLinkedOutputTitle(output)}
                            </p>
                            <p className="text-xs text-foreground/40">
                              {output.category ?? outputType}
                              {output.id === group.root.id
                                ? ' · parent'
                                : ' · variant'}
                            </p>
                          </div>
                          {isKept ? (
                            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                              Kept
                            </span>
                          ) : null}
                        </div>

                        {description ? (
                          <p className="mt-2 line-clamp-3 text-sm text-foreground/60">
                            {description}
                          </p>
                        ) : null}

                        <p className="mt-2 text-xs text-foreground/40">
                          ID: {output.id}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size={ButtonSize.SM}
                            variant={ButtonVariant.SECONDARY}
                            disabled={isBusy}
                            onClick={() =>
                              void (isKept
                                ? onUnkeepOutput(taskId, output.id)
                                : onKeepOutput(taskId, output.id))
                            }
                          >
                            {isKept ? 'Remove from kept' : 'Keep output'}
                          </Button>
                          <Button
                            size={ButtonSize.SM}
                            variant={ButtonVariant.SECONDARY}
                            disabled={isBusy}
                            onClick={() =>
                              void onTrashOutput(taskId, output.id)
                            }
                          >
                            Trash
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}
