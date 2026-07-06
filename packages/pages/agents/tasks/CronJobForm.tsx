import type { CronJobType } from '@services/automation/cron-jobs.service';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Link from 'next/link';

const CUSTOM_SCHEDULE_PRESET = 'custom';

const schedulePresetOptions = [
  { label: 'Every 15 minutes', schedule: '*/15 * * * *', value: 'every-15m' },
  { label: 'Every hour', schedule: '0 * * * *', value: 'hourly' },
  { label: 'Daily at 9:00 UTC', schedule: '0 9 * * *', value: 'daily-9' },
  {
    label: 'Weekdays at 9:00 UTC',
    schedule: '0 9 * * 1-5',
    value: 'weekdays-9',
  },
  {
    label: 'Mondays at 9:00 UTC',
    schedule: '0 9 * * 1',
    value: 'weekly-monday-9',
  },
] as const;

const jobTypeOptions: Array<{ label: string; value: CronJobType }> = [
  { label: 'Newsletter (Substack)', value: 'newsletter_substack' },
  { label: 'Workflow Execution', value: 'workflow_execution' },
  { label: 'Agent Strategy', value: 'agent_strategy_execution' },
];

function getSchedulePresetValue(schedule: string): string {
  const preset = schedulePresetOptions.find(
    (option) => option.schedule === schedule,
  );
  return preset?.value ?? CUSTOM_SCHEDULE_PRESET;
}

export interface CronJobFormState {
  id?: string;
  name: string;
  jobType: CronJobType;
  schedule: string;
  timezone: string;
  maxRetries: string;
  retryBackoffMinutes: string;
  webhookHeadersText: string;
  webhookSecret: string;
  webhookUrl: string;
  payloadText: string;
}

type CronJobFormProps = {
  form: CronJobFormState;
  setForm: React.Dispatch<React.SetStateAction<CronJobFormState>>;
  onSave: () => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
  onTestWebhook: () => Promise<void>;
  workflowsHref: string;
};

export default function CronJobForm({
  form,
  setForm,
  onSave,
  onCancel,
  onDelete,
  onTestWebhook,
  workflowsHref,
}: CronJobFormProps) {
  return (
    <div className="mb-4 rounded bg-card p-4 shadow-border">
      <div className="mb-3 text-sm font-semibold">
        {form.id ? 'Edit Cron Job' : 'Create Cron Job'}
      </div>
      {form.jobType === 'workflow_execution' && (
        <div className="mb-4 rounded bg-secondary px-3 py-2 text-xs text-muted-foreground">
          Workflow schedules start in{' '}
          <Link
            href={workflowsHref}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Workflows
          </Link>
          . Use this form when you need direct cron-level control over a
          workflow execution job.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="cron-job-name"
            className="text-sm font-medium text-foreground"
          >
            Name
          </label>
          <Input
            id="cron-job-name"
            value={form.name}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="cron-job-type"
          >
            Type
          </label>
          <Select
            value={form.jobType}
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                jobType: value as CronJobType,
              }))
            }
          >
            <SelectTrigger id="cron-job-type">
              <SelectValue placeholder="Select a job type" />
            </SelectTrigger>
            <SelectContent>
              {jobTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="cron-schedule-preset"
          >
            Schedule Preset
          </label>
          <Select
            value={getSchedulePresetValue(form.schedule)}
            onValueChange={(value) => {
              if (value === CUSTOM_SCHEDULE_PRESET) {
                return;
              }

              const preset = schedulePresetOptions.find(
                (option) => option.value === value,
              );
              if (!preset) {
                return;
              }

              setForm((prev) => ({ ...prev, schedule: preset.schedule }));
            }}
          >
            <SelectTrigger
              id="cron-schedule-preset"
              aria-label="Schedule preset"
            >
              <SelectValue placeholder="Choose a schedule preset" />
            </SelectTrigger>
            <SelectContent>
              {schedulePresetOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_SCHEDULE_PRESET}>Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="cron-job-schedule"
            className="text-sm font-medium text-foreground"
          >
            Cron Expression
          </label>
          <Input
            id="cron-job-schedule"
            value={form.schedule}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, schedule: event.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="cron-job-timezone"
            className="text-sm font-medium text-foreground"
          >
            Timezone
          </label>
          <Input
            id="cron-job-timezone"
            value={form.timezone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, timezone: event.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="cron-job-max-retries"
            className="text-sm font-medium text-foreground"
          >
            Max Retries
          </label>
          <Input
            id="cron-job-max-retries"
            type="number"
            min={0}
            max={20}
            value={form.maxRetries}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                maxRetries: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="cron-job-retry-backoff"
            className="text-sm font-medium text-foreground"
          >
            Retry Backoff (minutes)
          </label>
          <Input
            id="cron-job-retry-backoff"
            type="number"
            min={1}
            max={1440}
            value={form.retryBackoffMinutes}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                retryBackoffMinutes: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Textarea
            id="cron-job-payload"
            label="Payload JSON"
            rows={10}
            className="font-mono text-xs"
            value={form.payloadText}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                payloadText: event.target.value,
              }))
            }
          />
        </div>
        {form.jobType === 'newsletter_substack' && (
          <>
            <div className="space-y-1.5">
              <label
                htmlFor="cron-job-webhook-url"
                className="text-sm font-medium text-foreground"
              >
                Substack Bridge Webhook URL
              </label>
              <Input
                id="cron-job-webhook-url"
                placeholder="https://your-bridge.example.com/substack/draft"
                value={form.webhookUrl}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    webhookUrl: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="cron-job-webhook-secret"
                className="text-sm font-medium text-foreground"
              >
                Substack Bridge Secret
              </label>
              <Input
                id="cron-job-webhook-secret"
                placeholder="Optional shared secret"
                value={form.webhookSecret}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    webhookSecret: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Textarea
                id="cron-job-webhook-headers"
                label="Substack Bridge Headers JSON"
                rows={5}
                className="font-mono text-xs"
                value={form.webhookHeadersText}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    webhookHeadersText: event.target.value,
                  }))
                }
              />
            </div>
            <div className="md:col-span-2">
              <Button
                label="Test Webhook"
                className="h-8 px-3 text-xs font-semibold"
                onClick={async () => {
                  await onTestWebhook();
                }}
              />
            </div>
          </>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          label="Save"
          className="h-8 px-3 text-xs font-semibold"
          onClick={async () => {
            await onSave();
          }}
        />
        <Button
          label="Cancel"
          className="h-8 px-3 text-xs font-semibold"
          onClick={onCancel}
        />
        {form.id && (
          <Button
            label="Delete"
            className="h-8 px-3 text-xs font-semibold"
            onClick={async () => {
              await onDelete();
            }}
          />
        )}
      </div>
    </div>
  );
}
