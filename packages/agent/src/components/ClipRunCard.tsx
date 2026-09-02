import type {
  ClipRunCardState,
  ClipRunModes,
  ClipRunStep,
} from '@genfeedai/agent/models/clip-run-card.model';
import { ButtonVariant } from '@genfeedai/contracts';
import type { AgentClipRunIdentity } from '@genfeedai/contracts/interfaces';
import { Button } from '@ui/primitives/button';
import { CircleCheck, ExternalLink, Film, TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';

import { AgentErrorMessage } from './AgentErrorMessage';

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
      return 'text-success';
    case 'failed':
      return 'text-destructive';
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
        className: 'bg-info/10 text-info',
        label: 'Running',
      };
    case 'paused':
      return {
        className: 'bg-warning/10 text-warning',
        label: 'Paused',
      };
    case 'done':
      return {
        className: 'bg-success/10 text-success',
        label: 'Done',
      };
    case 'failed':
      return {
        className: 'bg-destructive/10 text-destructive',
        label: 'Failed',
      };
    default:
      return {
        className: 'bg-muted text-muted-foreground',
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

function getIdentitySummary(identity: AgentClipRunIdentity): string {
  return identity.isComplete
    ? `Avatar ${identity.avatarId} and voice ${identity.voiceId} are ready.`
    : `Missing ${identity.missing.join(' and ')}.`;
}

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
    <div className="mt-2 overflow-hidden border border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Film className="size-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Clip Run</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-2xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="space-y-3 p-3">
        {/* Step progress list */}
        <div className="border border-border p-2.5">
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
        <div className="border border-border p-2.5">
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

        {state.identity && (
          <div
            className={`border px-3 py-2 text-xs ${
              state.identity.isComplete
                ? 'border-success/20 bg-success/10 text-success   '
                : 'border-warning/20 bg-warning/10 text-warning   '
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Clip identity</span>
              <span>{state.identity.label}</span>
            </div>
            <p className="mt-1 text-muted-foreground">
              {getIdentitySummary(state.identity)}
            </p>
          </div>
        )}

        {/* Error state */}
        {state.status === 'failed' && failedStep && (
          <AgentErrorMessage
            className="text-xs"
            message={`Failed at: ${failedStep.label}\n${failedStep.errorMessage}${
              failedStep.retryable ? '\nThis step can be retried.' : ''
            }`}
          />
        )}

        {/* Confirmation prompt */}
        {state.confirmationPending && (
          <div className="border border-warning/20 bg-warning/10 p-3  ">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-warning ">
              <TriangleAlert className="size-4" />
              <span>
                {state.confirmationMessage ?? 'Confirmation required'}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
                onClick={onConfirm}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium"
              >
                <CircleCheck className="size-3.5" />
                Confirm
              </Button>
              <Button
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
                onClick={onCancel}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Final output link */}
        {state.status === 'done' && state.finalOutputUrl && (
          <div className="flex items-center gap-2 border border-success/20 bg-success/10 px-3 py-2  ">
            <CircleCheck className="size-4 text-success " />
            <a
              href={state.finalOutputUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-success underline-offset-2 hover:underline "
            >
              View Final Output
              <ExternalLink className="size-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
