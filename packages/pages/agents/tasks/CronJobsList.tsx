'use client';

import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useMemo } from 'react';
import { HiOutlineClock } from 'react-icons/hi2';
import CronJobRunHistory from './CronJobRunHistory';
import type { CronJob } from './cron-jobs-list.types';
import { statusColorMap } from './cron-jobs-list.types';
import { useCronJobsList } from './useCronJobsList';

export default function CronJobsList() {
  const {
    handleRefresh,
    href,
    isLoading,
    isRefreshing,
    isRunsLoading,
    jobs,
    loadRuns,
    runStatusFilter,
    runTriggerFilter,
    runs,
    selectedJob,
    selectedRun,
    setRunStatusFilter,
    setRunTriggerFilter,
    setRuns,
    setSelectedJob,
    setSelectedRun,
  } = useCronJobsList();

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      const statusMatches =
        runStatusFilter === 'all' || run.status === runStatusFilter;
      const triggerMatches =
        runTriggerFilter === 'all' || run.trigger === runTriggerFilter;
      return statusMatches && triggerMatches;
    });
  }, [runs, runStatusFilter, runTriggerFilter]);

  const columns = useMemo(
    () => [
      { header: 'Name', key: 'name' as const },
      {
        header: 'Type',
        key: 'jobType' as const,
        render: (job: CronJob) => (
          <span className="text-xs uppercase text-white/60">{job.jobType}</span>
        ),
      },
      {
        header: 'Schedule',
        key: 'schedule' as const,
        render: (job: CronJob) => (
          <span className="text-xs text-white/70">
            {job.schedule} ({job.timezone})
          </span>
        ),
      },
      {
        header: 'Last Run',
        key: 'lastRun' as const,
        render: (job: CronJob) => (
          <div className="flex items-center gap-2">
            <Badge
              status={statusColorMap[job.lastRun.status] ?? 'default'}
              className="uppercase"
            >
              {job.lastRun.status}
            </Badge>
            {job.lastRun.at && (
              <span className="text-xs text-white/40">
                {new Date(job.lastRun.at).toLocaleString()}
              </span>
            )}
          </div>
        ),
      },
      {
        header: 'Next Run',
        key: 'nextRun' as const,
        render: (job: CronJob) =>
          job.nextRun ? (
            <span className="text-sm text-white/60">
              {new Date(job.nextRun).toLocaleString()}
            </span>
          ) : (
            <span className="text-sm text-white/30">-</span>
          ),
      },
      {
        header: 'Status',
        key: 'paused' as const,
        render: (job: CronJob) => (
          <div className="flex items-center gap-2">
            <Badge
              status={job.paused ? 'default' : 'success'}
              className="uppercase"
            >
              {job.paused ? 'Paused' : 'Active'}
            </Badge>
            {job.failures > 0 && (
              <span className="text-xs text-destructive">
                {job.failures} failures
              </span>
            )}
          </div>
        ),
      },
      {
        header: 'Actions',
        key: 'id' as const,
        render: (job: CronJob) => (
          <div className="flex items-center gap-2">
            <Button
              label="Runs"
              className="h-7 px-2 text-xs font-medium"
              onClick={async () => {
                await loadRuns(job);
              }}
            />
          </div>
        ),
      },
    ],
    [loadRuns],
  );

  return (
    <Container
      label="Scheduled Tasks"
      description="Monitor cron jobs and agent runs."
      icon={HiOutlineClock}
      right={
        <div className="flex items-center gap-2">
          <Link
            href={href('/workflows')}
            className="inline-flex h-8 items-center rounded border border-white/10 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-white/[0.04]"
          >
            Open Workflows
          </Link>
          <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />
        </div>
      }
    >
      <div className="mb-4 rounded-lg bg-secondary px-4 py-3 text-sm text-muted-foreground shadow-border">
        Legacy cron jobs are read-only. Create and manage recurring automation
        in Workflows.
      </div>

      <AppTable<CronJob>
        items={jobs}
        columns={columns}
        getRowKey={(job) => job.id}
        isLoading={isLoading}
        emptyLabel="No scheduled tasks configured"
      />

      {selectedJob && (
        <CronJobRunHistory
          jobName={selectedJob.name}
          runs={runs}
          filteredRuns={filteredRuns}
          isRunsLoading={isRunsLoading}
          selectedRun={selectedRun}
          runStatusFilter={runStatusFilter}
          runTriggerFilter={runTriggerFilter}
          onClose={() => {
            setSelectedJob(null);
            setSelectedRun(null);
            setRuns([]);
          }}
          onSelectRun={setSelectedRun}
          onSetStatusFilter={setRunStatusFilter}
          onSetTriggerFilter={setRunTriggerFilter}
        />
      )}
    </Container>
  );
}
