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
import type { CronJobFormState } from './CronJobForm';
import {
  type CronJob,
  defaultFormState,
  parseWebhookHeaders,
  toCronJob,
  validateWebhookUrl,
} from './cron-jobs-list.types';

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

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<CronJobFormState>(defaultFormState);

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

  const openCreateForm = useCallback(() => {
    setForm(defaultFormState);
    setIsFormOpen(true);
  }, []);

  const openEditForm = useCallback((job: CronJob) => {
    const payloadWebhookHeaders =
      typeof job.payload.webhookHeaders === 'object' &&
      job.payload.webhookHeaders !== null
        ? (job.payload.webhookHeaders as Record<string, string>)
        : {};

    setForm({
      id: job.id,
      jobType: job.jobType,
      maxRetries: String(job.maxRetries ?? 0),
      name: job.name,
      payloadText: JSON.stringify(job.payload ?? {}, null, 2),
      retryBackoffMinutes: String(job.retryBackoffMinutes ?? 5),
      schedule: job.schedule,
      timezone: job.timezone,
      webhookHeadersText: JSON.stringify(payloadWebhookHeaders, null, 2),
      webhookSecret:
        typeof job.payload.webhookSecret === 'string'
          ? job.payload.webhookSecret
          : '',
      webhookUrl:
        typeof job.payload.webhookUrl === 'string'
          ? job.payload.webhookUrl
          : '',
    });
    setIsFormOpen(true);
  }, []);

  const saveForm = useCallback(async () => {
    try {
      const service = await getService();
      const parsedPayload = JSON.parse(form.payloadText || '{}') as Record<
        string,
        unknown
      >;
      const webhookHeaders =
        form.jobType === 'newsletter_substack'
          ? parseWebhookHeaders(form.webhookHeadersText)
          : {};

      if (form.jobType === 'newsletter_substack') {
        const webhookUrlError = validateWebhookUrl(form.webhookUrl);
        if (webhookUrlError) {
          notificationsService.error(webhookUrlError);
          return;
        }
      }

      const mergedPayload =
        form.jobType === 'newsletter_substack'
          ? {
              ...parsedPayload,
              webhookHeaders,
              ...(form.webhookSecret.trim()
                ? { webhookSecret: form.webhookSecret }
                : {}),
              webhookUrl: form.webhookUrl,
            }
          : parsedPayload;

      const maxRetries = Number.parseInt(form.maxRetries, 10);
      const retryBackoffMinutes = Number.parseInt(form.retryBackoffMinutes, 10);

      if (Number.isNaN(maxRetries) || maxRetries < 0 || maxRetries > 20) {
        notificationsService.error('Max retries must be between 0 and 20');
        return;
      }

      if (
        Number.isNaN(retryBackoffMinutes) ||
        retryBackoffMinutes < 1 ||
        retryBackoffMinutes > 1440
      ) {
        notificationsService.error(
          'Retry backoff minutes must be between 1 and 1440',
        );
        return;
      }

      if (form.id) {
        await service.update(form.id, {
          jobType: form.jobType,
          maxRetries,
          name: form.name,
          payload: mergedPayload,
          retryBackoffMinutes,
          schedule: form.schedule,
          timezone: form.timezone,
        });
        notificationsService.success('Cron job updated');
      } else {
        await service.create({
          jobType: form.jobType,
          maxRetries,
          name: form.name,
          payload: mergedPayload,
          retryBackoffMinutes,
          schedule: form.schedule,
          timezone: form.timezone,
        });
        notificationsService.success('Cron job created');
      }

      setIsFormOpen(false);
      await loadJobs();
    } catch (error: unknown) {
      logger.error('Failed to save cron job', error);
      notificationsService.error(
        'Failed to save cron job. Check cron, payload JSON, and webhook headers JSON.',
      );
    }
  }, [form, getService, loadJobs, notificationsService]);

  const testWebhook = useCallback(async () => {
    try {
      const webhookUrlError = validateWebhookUrl(form.webhookUrl);
      if (webhookUrlError) {
        notificationsService.error(webhookUrlError);
        return;
      }

      const headers = parseWebhookHeaders(form.webhookHeadersText);
      const service = await getService();
      const result = await service.testWebhook({
        webhookHeaders: headers,
        webhookSecret: form.webhookSecret,
        webhookUrl: form.webhookUrl,
      });

      const delivery =
        typeof result.delivery === 'object' && result.delivery
          ? (result.delivery as { status?: string; reason?: string })
          : null;

      if (delivery?.status === 'delivered') {
        notificationsService.success('Webhook test delivered successfully');
      } else {
        notificationsService.error(
          delivery?.reason ?? 'Webhook test did not deliver',
        );
      }
    } catch (error: unknown) {
      logger.error('Failed to test webhook', error);
      notificationsService.error('Webhook test failed');
    }
  }, [
    form.webhookHeadersText,
    form.webhookSecret,
    form.webhookUrl,
    getService,
    notificationsService,
  ]);

  const deleteJob = useCallback(
    async (job: CronJob) => {
      if (!window.confirm(`Delete cron job "${job.name}"?`)) {
        return;
      }

      try {
        const service = await getService();
        await service.delete(job.id);
        notificationsService.success(`Deleted "${job.name}"`);
        setIsFormOpen(false);
        await loadJobs();
      } catch (error: unknown) {
        logger.error('Failed to delete cron job', error);
        notificationsService.error('Failed to delete cron job');
      }
    },
    [getService, loadJobs, notificationsService],
  );

  const deleteFormJob = useCallback(async () => {
    if (!form.id) {
      return;
    }

    await deleteJob({
      failures: 0,
      id: form.id,
      jobType: form.jobType,
      lastRun: {
        at: null,
        status: 'never',
      },
      maxRetries: Number.parseInt(form.maxRetries, 10) || 0,
      name: form.name,
      nextRun: null,
      paused: false,
      payload: {},
      retryBackoffMinutes: Number.parseInt(form.retryBackoffMinutes, 10) || 5,
      schedule: form.schedule,
      timezone: form.timezone,
    });
  }, [deleteJob, form]);

  const handleRunNow = useCallback(
    async (job: CronJob) => {
      try {
        const service = await getService();
        await service.runNow(job.id);
        notificationsService.success(`Triggered "${job.name}"`);
        await loadJobs();
        await loadRuns(job);
      } catch (error: unknown) {
        logger.error('Failed to run cron job', error);
        notificationsService.error('Failed to trigger cron job');
      }
    },
    [getService, loadJobs, loadRuns, notificationsService],
  );

  const handleTogglePause = useCallback(
    async (job: CronJob) => {
      try {
        const service = await getService();
        if (job.paused) {
          await service.resume(job.id);
          notificationsService.success(`Resumed "${job.name}"`);
        } else {
          await service.pause(job.id);
          notificationsService.success(`Paused "${job.name}"`);
        }
        await loadJobs();
      } catch (error: unknown) {
        logger.error('Failed to toggle cron job', error);
        notificationsService.error('Failed to update cron job');
      }
    },
    [getService, loadJobs, notificationsService],
  );

  return {
    deleteFormJob,
    deleteJob,
    form,
    handleRefresh,
    handleRunNow,
    handleTogglePause,
    href,
    isFormOpen,
    isLoading,
    isRefreshing,
    isRunsLoading,
    jobs,
    loadRuns,
    openCreateForm,
    openEditForm,
    runStatusFilter,
    runTriggerFilter,
    runs,
    saveForm,
    selectedJob,
    selectedRun,
    setForm,
    setIsFormOpen,
    setRunStatusFilter,
    setRunTriggerFilter,
    setRuns,
    setSelectedJob,
    setSelectedRun,
    testWebhook,
  };
}
