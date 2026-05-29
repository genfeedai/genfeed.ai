'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  type CronJobRecord,
  CronJobsService,
  type CronJobType,
  type CronRunRecord,
} from '@services/automation/cron-jobs.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiOutlineClock } from 'react-icons/hi2';
import CronJobForm, { type CronJobFormState } from './CronJobForm';
import CronJobRunHistory from './CronJobRunHistory';

interface CronJob {
  id: string;
  name: string;
  jobType: CronJobType;
  schedule: string;
  timezone: string;
  payload: Record<string, unknown>;
  lastRun: {
    status: 'success' | 'failed' | 'running' | 'never';
    at: string | null;
  };
  nextRun: string | null;
  paused: boolean;
  failures: number;
  maxRetries: number;
  retryBackoffMinutes: number;
}

const defaultNewsletterPayload = {
  instructions:
    'Focus on Genfeed.ai product updates and actionable creator workflows.',
  model: 'openai/gpt-4o-mini',
  publicationName: 'Genfeed.ai',
  sources: ['https://genfeed.ai', 'https://genfeed.ai/workflows'],
  topic: 'Genfeed.ai weekly update',
  webhookHeaders: {
    'X-Target': 'substack-bridge',
  },
  webhookUrl: '',
};

const defaultFormState: CronJobFormState = {
  jobType: 'newsletter_substack',
  maxRetries: '0',
  name: 'Genfeed Newsletter (Substack Draft)',
  payloadText: JSON.stringify(defaultNewsletterPayload, null, 2),
  retryBackoffMinutes: '5',
  schedule: '0 9 * * 1',
  timezone: 'UTC',
  webhookHeadersText: JSON.stringify(
    defaultNewsletterPayload.webhookHeaders,
    null,
    2,
  ),
  webhookSecret: '',
  webhookUrl: '',
};

const statusColorMap: Record<string, string> = {
  failed: 'error',
  never: 'default',
  running: 'warning',
  success: 'success',
};

function toCronJob(record: CronJobRecord): CronJob {
  return {
    failures: record.consecutiveFailures,
    id: record.id,
    jobType: record.jobType,
    lastRun: {
      at: record.lastRunAt ?? null,
      status: record.lastStatus,
    },
    maxRetries: record.maxRetries ?? 0,
    name: record.name,
    nextRun: record.nextRunAt ?? null,
    paused: !record.enabled,
    payload: record.payload ?? {},
    retryBackoffMinutes: record.retryBackoffMinutes ?? 5,
    schedule: record.schedule,
    timezone: record.timezone,
  };
}

function validateWebhookUrl(url: string): string | null {
  if (!url.trim()) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const isHttp = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    if (!isHttp) {
      return 'Webhook URL must start with http:// or https://';
    }

    const blockedHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if (blockedHosts.has(parsed.hostname)) {
      return 'Webhook URL cannot use localhost or loopback hosts';
    }

    return null;
  } catch {
    return 'Webhook URL is invalid';
  }
}

function parseWebhookHeaders(headersText: string): Record<string, string> {
  const parsed = JSON.parse(headersText || '{}') as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Webhook headers must be a JSON object');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const invalid = entries.find(([, value]) => typeof value !== 'string');
  if (invalid) {
    throw new Error('Webhook headers values must be strings');
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

export default function CronJobsList() {
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
              <span className="text-xs text-red-400">
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
              label="Run Now"
              className="h-7 px-2 text-xs font-medium"
              onClick={async () => {
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
              }}
            />
            <Button
              label="Edit"
              className="h-7 px-2 text-xs font-medium"
              onClick={() => openEditForm(job)}
            />
            <Button
              label="Delete"
              className="h-7 px-2 text-xs font-medium"
              onClick={async () => {
                await deleteJob(job);
              }}
            />
            <Button
              label={job.paused ? 'Resume' : 'Pause'}
              className="h-7 px-2 text-xs font-medium"
              onClick={async () => {
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
              }}
            />
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
    [
      deleteJob,
      getService,
      loadJobs,
      loadRuns,
      notificationsService,
      openEditForm,
    ],
  );

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      const statusMatches =
        runStatusFilter === 'all' || run.status === runStatusFilter;
      const triggerMatches =
        runTriggerFilter === 'all' || run.trigger === runTriggerFilter;
      return statusMatches && triggerMatches;
    });
  }, [runs, runStatusFilter, runTriggerFilter]);

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
          <Button
            label="New Cron Job"
            className="h-8 px-3 text-xs font-semibold"
            onClick={openCreateForm}
          />
          <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />
        </div>
      }
    >
      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-muted-foreground">
        Create and edit recurring automations in Workflows, then use this page
        to schedule, run, and monitor the underlying cron jobs.
      </div>

      {isFormOpen && (
        <CronJobForm
          form={form}
          setForm={setForm}
          onSave={saveForm}
          onCancel={() => setIsFormOpen(false)}
          onDelete={deleteFormJob}
          onTestWebhook={testWebhook}
          workflowsHref={href('/workflows')}
        />
      )}

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
