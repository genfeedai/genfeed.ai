import type {
  ClipRunCardState,
  ClipRunModes,
  ClipRunStep,
} from '@cloud/agent/models/clip-run-card.model';
import type { ReactElement } from 'react';
import {
  HiCheckCircle,
  HiExclamationTriangle,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineFilm,
  HiXCircle,
} from 'react-icons/hi2';

interface ClipRunCardProps {
  state: ClipRunCardState;
  onConfirm?: () => void;
  onCancel?: () => void;
}

const STATUS_ICON: Record<ClipRunStep['status'], string> = {
  done: '✅',
  failed: '❌',
  pending: '⏳',
  running: '🔄',
  skipped: '⏭️',
};

function stepStatusClass(status: ClipRunStep['status']): string {
  switch (status) {
    case 'done':
      return 'text-green-600 dark:text-green-400';
    case 'failed':
      return 'text-red-600 dark:text-red-400';
    case 'running':
      return 'text-primary';
    case 'skipped':
      return 'text-muted-foreground line-through';
    default:
      return 'text-muted-foreground';
  }
}

function cardStatusBadge(status: ClipRunCardState['status']): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'running':
      return {
        className:
          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        label: 'Running',
      };
    case 'paused':
      return {
        className:
          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
        label: 'Paused',
      };
    case 'done':
      return {
        className:
          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        label: 'Done',
      };
    case 'failed':
      return {
        className:
          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        label: 'Failed',
      };
    default:
      return {
        className:
          'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        label: 'Idle',
      };
  }
}

type ClipRunToggleKey = keyof Pick<
  ClipRunModes,
  'confirmBeforePublish' | 'enableMerge' | 'enableReframe'
>;

const MODE_LABELS: Record<ClipRunToggleKey, string> = {
  confirmBeforePublish: 'Confirm Before Publish',
  enableMerge: 'Merge Enabled',
  enableReframe: 'Reframe Enabled',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'Twitter / X',
};

export function ClipRunCard({
  state,
  onConfirm,
  onCancel,
}: ClipRunCardProps): ReactElement {
  const badge = cardStatusBadge(state.status);
  const failedStep = state.steps.find(
    (s) => s.status === 'failed' && s.errorMessage,
  );

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <HiOutlineFilm className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Clip Run</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="space-y-3 p-3">
        {/* Step progress list */}
        <div className="rounded border border-border p-2.5">
          <p className="mb-2 text-xs font-medium text-foreground">Steps</p>
          <div className="space-y-1.5">
            {state.steps.map((step) => (
              <div
                key={step.id}
                className={`flex items-center justify-between text-xs ${stepStatusClass(step.status)}`}
              >
                <span className="flex items-center gap-1.5">
                  <span>{STATUS_ICON[step.status]}</span>
                  <span>{step.label}</span>
                </span>
                <span className="capitalize">{step.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mode display */}
        <div className="rounded border border-border p-2.5">
          <p className="mb-2 text-xs font-medium text-foreground">Modes</p>
          <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
            {(Object.entries(MODE_LABELS) as [ClipRunToggleKey, string][]).map(
              ([key, label]) => (
                <span key={key} className="flex items-center gap-1">
                  <span>{state.modes[key] ? '✓' : '✗'}</span>
                  <span>{label}</span>
                </span>
              ),
            )}
            <span className="flex items-center gap-1">
              <span>📺</span>
              <span>
                {PLATFORM_LABELS[state.modes.platform] ?? state.modes.platform}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span>⏱️</span>
              <span>{state.modes.duration}s</span>
            </span>
            <span className="flex items-center gap-1">
              <span>📐</span>
              <span>{state.modes.aspectRatio}</span>
            </span>
          </div>
        </div>

        {/* Error state */}
        {state.status === 'failed' && failedStep && (
          <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <HiXCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Failed at: {failedStep.label}</p>
              <p>{failedStep.errorMessage}</p>
              {failedStep.retryable && (
                <p className="mt-1 text-muted-foreground">
                  This step can be retried.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Confirmation prompt */}
        {state.confirmationPending && (
          <div className="rounded border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-yellow-700 dark:text-yellow-300">
              <HiExclamationTriangle className="h-4 w-4" />
              <span>
                {state.confirmationMessage ?? 'Confirmation required'}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onConfirm}
                className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <HiCheckCircle className="h-3.5 w-3.5" />
                Confirm
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Final output link */}
        {state.status === 'done' && state.finalOutputUrl && (
          <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950">
            <HiCheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <a
              href={state.finalOutputUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-green-700 underline-offset-2 hover:underline dark:text-green-300"
            >
              View Final Output
              <HiOutlineArrowTopRightOnSquare className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
