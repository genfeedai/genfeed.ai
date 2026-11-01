import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { WorkspaceTaskOutputsCardProps } from '@/features/workspace/props/workspace-task-outputs-card.props';
import {
  getWorkspaceLinkedOutputDescription,
  getWorkspaceLinkedOutputTitle,
} from './workspace-task-inspector-helpers';

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
  const { href } = useOrgUrl();

  return (
    <Card label="Generated outputs">
      <div className="flex flex-col gap-3 text-sm text-foreground/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-foreground/70">
            Review all active variants here. Kept outputs stay visible; trashed
            variants disappear from the thread.
          </p>
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
          >
            <Link href={href(APP_ROUTES.LIBRARY.ASSETS)}>Open library</Link>
          </Button>
        </div>

        {linkedOutputSummary.isLoading ? <p>Loading linked outputs…</p> : null}

        {linkedOutputSummary.error ? (
          <p className="text-warning">{linkedOutputSummary.error}</p>
        ) : null}

        {linkedOutputGroups.length > 0 ? (
          <div
            className="divide-y divide-border"
            data-testid="workspace-task-linked-outputs"
          >
            {linkedOutputGroups.map((group) => {
              const outputs = [group.root, ...group.children];
              return (
                <article
                  key={group.root.id}
                  className="py-3 first:pt-0 last:pb-0"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">
                      {getWorkspaceLinkedOutputTitle(group.root)}
                    </p>
                    <Badge variant="secondary">
                      {outputs.length} variant{outputs.length === 1 ? '' : 's'}
                    </Badge>
                  </div>

                  <div className="divide-y divide-border">
                    {outputs.map((output) => {
                      const description =
                        getWorkspaceLinkedOutputDescription(output);
                      const isKept = approvedOutputIds.includes(output.id);

                      return (
                        <div
                          key={output.id}
                          className="py-3 first:pt-0 last:pb-0"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">
                                {getWorkspaceLinkedOutputTitle(output)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {output.category ?? outputType}
                                {output.id === group.root.id
                                  ? ' · parent'
                                  : ' · variant'}
                              </p>
                            </div>
                            {isKept ? (
                              <Badge variant="success">Kept</Badge>
                            ) : null}
                          </div>

                          {description ? (
                            <p className="mt-2 line-clamp-3 text-sm text-foreground/60">
                              {description}
                            </p>
                          ) : null}

                          <p className="mt-2 text-xs text-muted-foreground">
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
      </div>
    </Card>
  );
}
