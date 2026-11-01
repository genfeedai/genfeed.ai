import type {
  ClipperRunCardState,
  ClipperRunModes,
  ClipperRunStep,
} from '@genfeedai/agent/models/clipper-run-card.model';
import { ButtonVariant } from '@genfeedai/contracts';
import type { AgentClipperRunIdentity } from '@genfeedai/contracts/interfaces';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Badge, type BadgeProps } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { CircleCheck, ExternalLink, Film } from 'lucide-react';
import type { ReactElement } from 'react';

import { AgentErrorMessage } from './AgentErrorMessage';

interface ClipperRunCardProps {
  state: ClipperRunCardState;
  onConfirm?: () => void;
  onCancel?: () => void;
}

const STATUS_ICON: Record<ClipperRunStep['status'], string> = {
  done: '✅',
  failed: '❌',
  pending: '⏳',
  running: '🔄',
  skipped: '⏭️',
};

function stepStatusClass(status: ClipperRunStep['status']): string {
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

function cardStatusBadge(status: ClipperRunCardState['status']): {
  label: string;
  variant: BadgeProps['variant'];
} {
  switch (status) {
    case 'running':
      return {
        variant: 'info',
        label: 'Running',
      };
    case 'paused':
      return {
        variant: 'warning',
        label: 'Paused',
      };
    case 'done':
      return {
        variant: 'success',
        label: 'Done',
      };
    case 'failed':
      return {
        variant: 'destructive',
        label: 'Failed',
      };
    default:
      return {
        variant: 'secondary',
        label: 'Idle',
      };
  }
}

type ClipperRunToggleKey = keyof Pick<
  ClipperRunModes,
  'confirmBeforePublish' | 'enableMerge' | 'enableReframe'
>;

const MODE_LABELS: Record<ClipperRunToggleKey, string> = {
  confirmBeforePublish: 'Confirm Before Publish',
  enableMerge: 'Merge Enabled',
  enableReframe: 'Reframe Enabled',
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'Twitter / X',
};

function getIdentitySummary(identity: AgentClipperRunIdentity): string {
  return identity.isComplete
    ? `Avatar ${identity.avatarId} and voice ${identity.voiceId} are ready.`
    : `Missing ${identity.missing.join(' and ')}.`;
}

export function ClipperRunCard({
  state,
  onConfirm,
  onCancel,
}: ClipperRunCardProps): ReactElement {
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
        <Badge variant={badge.variant}>{badge.label}</Badge>
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
            {(
              Object.entries(MODE_LABELS) as [ClipperRunToggleKey, string][]
            ).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1">
                <span>{state.modes[key] ? '✓' : '✗'}</span>
                <span>{label}</span>
              </span>
            ))}
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
          <Alert
            size="sm"
            variant={state.identity.isComplete ? 'success' : 'warning'}
          >
            <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
              Clip identity
              <span>{state.identity.label}</span>
            </AlertTitle>
            <AlertDescription>
              {getIdentitySummary(state.identity)}
            </AlertDescription>
          </Alert>
        )}

        {/* Error state */}
        {state.status === 'failed' && failedStep && (
          <AgentErrorMessage
            message={`Failed at: ${failedStep.label}\n${failedStep.errorMessage}${
              failedStep.retryable ? '\nThis step can be retried.' : ''
            }`}
          />
        )}

        {/* Confirmation prompt */}
        {state.confirmationPending && (
          <Alert variant="warning">
            <AlertTitle>
              {state.confirmationMessage ?? 'Confirmation required'}
            </AlertTitle>
            <AlertActions>
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
            </AlertActions>
          </Alert>
        )}

        {/* Final output link */}
        {state.status === 'done' && state.finalOutputUrl && (
          <Alert size="sm" variant="success">
            <a
              href={state.finalOutputUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-success underline-offset-2 hover:underline "
            >
              View Final Output
              <ExternalLink className="size-3" />
            </a>
          </Alert>
        )}
      </div>
    </div>
  );
}
