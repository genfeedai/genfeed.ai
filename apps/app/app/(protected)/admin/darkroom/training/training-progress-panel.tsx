import type { IDarkroomTraining } from '@genfeedai/interfaces';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';

const STAGE_EMOJIS: Record<string, string> = {
  completed: '✅',
  downloading: '📥',
  failed: '❌',
  preparing: '📦',
  processing: '⚡',
  queued: '🕐',
  training: '🧠',
  uploading: '📤',
};

type Props = {
  training: IDarkroomTraining;
};

export default function TrainingProgressPanel({ training }: Props) {
  return (
    <WorkspaceSurface
      title="Training In Progress"
      tone="muted"
      className="mt-6"
      data-testid="darkroom-training-progress-surface"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">
            {STAGE_EMOJIS[training.stage || 'processing'] || '⚡'}
          </span>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">
                {training.stage || training.status}
              </span>

              <span className="text-sm text-foreground/60">
                {training.progress != null
                  ? `${Math.round(training.progress)}%`
                  : training.currentStep && training.totalSteps
                    ? `${training.currentStep}/${training.totalSteps}`
                    : '...'}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${training.progress ?? 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        <p className="text-sm text-foreground/50">
          {training.label} - {training.personaSlug}
        </p>
      </div>
    </WorkspaceSurface>
  );
}
