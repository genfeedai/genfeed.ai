import Card from '@ui/card/Card';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import { WORKSPACE_CARD_GRID_GAP_CLASS } from './workspace-task.helpers';

interface SummaryItem {
  label: string;
  value: string;
}

interface WorkspaceSnapshotSectionProps {
  isLoading?: boolean;
  summaryItems: SummaryItem[];
}

export function WorkspaceSnapshotSection({
  isLoading = false,
  summaryItems,
}: WorkspaceSnapshotSectionProps) {
  return (
    <section
      aria-busy={isLoading}
      data-testid="workspace-snapshot"
      className="space-y-3 mb-5"
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Workspace at a glance
        </h2>
      </div>
      <div className={WORKSPACE_CARD_GRID_GAP_CLASS}>
        {summaryItems.map((item) => (
          <Card
            key={item.label}
            className="h-full"
            bodyClassName="space-y-1 p-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
              {item.label}
            </p>
            {isLoading ? (
              <Skeleton variant="text" height={28} className="w-10" />
            ) : (
              <div className="text-xl font-semibold tracking-[-0.02em] text-foreground">
                {item.value}
              </div>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
