import { Pre } from '@genfeedai/ui';
import type { CronRunRecord } from '@services/automation/cron-jobs.service';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';

const statusColorMap: Record<string, string> = {
  failed: 'error',
  never: 'default',
  running: 'warning',
  success: 'success',
};

type CronJobRunHistoryProps = {
  jobName: string;
  runs: CronRunRecord[];
  filteredRuns: CronRunRecord[];
  isRunsLoading: boolean;
  selectedRun: CronRunRecord | null;
  runStatusFilter: 'all' | CronRunRecord['status'];
  runTriggerFilter: 'all' | CronRunRecord['trigger'];
  onClose: () => void;
  onSelectRun: (run: CronRunRecord) => void;
  onSetStatusFilter: (status: 'all' | CronRunRecord['status']) => void;
  onSetTriggerFilter: (trigger: 'all' | CronRunRecord['trigger']) => void;
};

export default function CronJobRunHistory({
  jobName,
  runs,
  filteredRuns,
  isRunsLoading,
  selectedRun,
  runStatusFilter,
  runTriggerFilter,
  onClose,
  onSelectRun,
  onSetStatusFilter,
  onSetTriggerFilter,
}: CronJobRunHistoryProps) {
  return (
    <div className="mt-5 rounded bg-card p-4 shadow-border">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Run History: {jobName}</div>
        <Button label="Close" className="h-7 px-2 text-xs" onClick={onClose} />
      </div>

      {isRunsLoading ? (
        <div className="text-xs text-muted-foreground">Loading runs…</div>
      ) : runs.length === 0 ? (
        <div className="text-xs text-muted-foreground">No runs yet.</div>
      ) : (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Status:</span>
            {(['all', 'success', 'failed', 'running'] as const).map(
              (status) => (
                <Button
                  key={status}
                  label={status}
                  className={`h-7 px-2 text-xs ${runStatusFilter === status ? 'bg-accent text-foreground' : 'bg-secondary text-muted-foreground hover:bg-accent'}`}
                  onClick={() => onSetStatusFilter(status)}
                />
              ),
            )}
            <span className="ml-2 text-xs text-muted-foreground">Trigger:</span>
            {(['all', 'scheduled', 'manual'] as const).map((trigger) => (
              <Button
                key={trigger}
                label={trigger}
                className={`h-7 px-2 text-xs ${runTriggerFilter === trigger ? 'bg-accent text-foreground' : 'bg-secondary text-muted-foreground hover:bg-accent'}`}
                onClick={() => onSetTriggerFilter(trigger)}
              />
            ))}
          </div>
          {filteredRuns.map((run) => (
            <Button
              key={run.id}
              className="h-auto w-full justify-start rounded bg-secondary px-3 py-2 text-left shadow-border"
              onClick={() => onSelectRun(run)}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge
                    status={statusColorMap[run.status] ?? 'default'}
                    className="uppercase"
                  >
                    {run.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {run.trigger}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {run.startedAt
                    ? new Date(run.startedAt).toLocaleString()
                    : '—'}
                </span>
              </div>
            </Button>
          ))}
          {filteredRuns.length === 0 && (
            <div className="text-xs text-muted-foreground">
              No runs for the selected filters.
            </div>
          )}
        </div>
      )}

      {selectedRun && (
        <div className="mt-3 rounded bg-secondary p-3">
          <div className="mb-1 text-xs text-muted-foreground">Run Detail</div>
          <Pre
            variant="ghost"
            size="sm"
            className="max-h-72 overflow-y-auto text-muted-foreground"
          >
            {JSON.stringify(selectedRun, null, 2)}
          </Pre>
        </div>
      )}
    </div>
  );
}
