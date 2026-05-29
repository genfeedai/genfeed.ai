import type { ReactElement } from 'react';

type StepKey =
  | 'trigger_workflow'
  | 'generate_clip'
  | 'merge_clips'
  | 'reframe_portrait'
  | 'supervised_review';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

const STEP_LABELS: Record<StepKey, string> = {
  generate_clip: 'Generate 30s landscape clip',
  merge_clips: 'Merge generated clips (optional)',
  reframe_portrait: 'Reframe to Instagram portrait',
  supervised_review: 'Open supervised review',
  trigger_workflow: 'Trigger workflow execution',
};

const STEP_ORDER: StepKey[] = [
  'trigger_workflow',
  'generate_clip',
  'merge_clips',
  'reframe_portrait',
  'supervised_review',
];

function toStepStatusClass(status: StepStatus): string {
  if (status === 'completed') return 'text-green-600';
  if (status === 'failed') return 'text-destructive';
  if (status === 'running') return 'text-primary';
  return 'text-muted-foreground';
}

interface ClipWorkflowStepsListProps {
  steps: Record<StepKey, StepStatus>;
}

export function ClipWorkflowStepsList({
  steps,
}: ClipWorkflowStepsListProps): ReactElement {
  return (
    <div className="border border-border p-2.5">
      <p className="mb-2 text-xs font-medium text-foreground">Run Steps</p>
      <div className="space-y-1.5">
        {STEP_ORDER.map((step) => (
          <div
            key={step}
            className={`flex items-center justify-between text-xs ${toStepStatusClass(steps[step])}`}
          >
            <span>{STEP_LABELS[step]}</span>
            <span className="capitalize">{steps[step]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
