'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  CronJobsService,
  type CronRunRecord,
} from '@services/automation/cron-jobs.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useCallback, useEffect, useState } from 'react';
import type { CronJob } from './cron-jobs-list.types';
import { toCronJob } from './cron-jobs-list.types';

export function useCronJobsList() {
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [runs, setRuns] = useState<CronRunRecord[]>([]);
  const [selectedJob, setSelectedJob] = useState<CronJob | null>(null);
  const [selectedRun, setSelectedRun] = useState<CronRunRecord | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunsLoading, setIsRunsLoading] = useState(false);

  const [runStatusFilter, setRunStatusFilter] = useState<
    'all' | CronRunRecord['status']
  >('all');
  const [runTriggerFilter, setRunTriggerFilter] = useState<
    'all' | CronRunRecord['trigger']
  >('all');

  const getService = useAuthedService((token: string) =>
    CronJobsService.getInstance(token),
  );

  const loadJobs = useCallback(async () => {
    try {
      const service = await getService();
      const data = await service.list();
      setJobs(data.map(toCronJob));
    } catch (error: unknown) {
      logger.error('Failed to load cron jobs', error);
      notificationsService.error('Failed to load cron jobs');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [getService, notificationsService]);

  const loadRuns = useCallback(
    async (job: CronJob) => {
      setSelectedJob(job);
      setSelectedRun(null);
      setRunStatusFilter('all');
      setRunTriggerFilter('all');
      setIsRunsLoading(true);
      try {
        const service = await getService();
        const data = await service.runs(job.id);
        setRuns(data);
      } catch (error: unknown) {
        logger.error('Failed to load cron runs', error);
        notificationsService.error('Failed to load cron runs');
      } finally {
        setIsRunsLoading(false);
      }
    },
    [getService, notificationsService],
  );

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadJobs();
  }, [loadJobs]);

  return {
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
  };
}
