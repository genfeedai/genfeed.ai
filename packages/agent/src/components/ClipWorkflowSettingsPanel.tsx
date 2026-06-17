import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import type { ReactElement } from 'react';
import {
  HiOutlineArrowPathRoundedSquare,
  HiOutlineBolt,
  HiOutlinePlay,
  HiOutlineSparkles,
} from 'react-icons/hi2';

type StepKey =
  | 'trigger_workflow'
  | 'generate_clip'
  | 'merge_clips'
  | 'reframe_portrait'
  | 'supervised_review';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

interface WorkflowRef {
  id: string;
  name: string;
}

interface ClipWorkflowSettingsPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  autonomousMode: boolean;
  onAutonomousModeChange: (value: boolean) => void;
  requireStepConfirmation: boolean;
  onRequireStepConfirmationChange: (value: boolean) => void;
  mergeGeneratedVideos: boolean;
  onMergeGeneratedVideosChange: (checked: boolean) => void;
  durationSeconds: number;
  onDurationSecondsChange: (value: number) => void;
  workflows: WorkflowRef[] | null | undefined;
  workflowId: string | undefined;
  onWorkflowIdChange: (nextId: string | undefined, status: StepStatus) => void;
  nextNonPublishStep: StepKey | undefined;
  canMerge: boolean;
  steps: Record<StepKey, StepStatus>;
  onRunNext: () => Promise<void>;
  onAddAnotherClip: () => Promise<void>;
  onMergeNow: () => Promise<void>;
  onOpenSupervisedReview: () => Promise<void>;
}

export function ClipWorkflowSettingsPanel({
  prompt,
  onPromptChange,
  autonomousMode,
  onAutonomousModeChange,
  requireStepConfirmation,
  onRequireStepConfirmationChange,
  mergeGeneratedVideos,
  onMergeGeneratedVideosChange,
  durationSeconds,
  onDurationSecondsChange,
  workflows,
  workflowId,
  onWorkflowIdChange,
  nextNonPublishStep,
  canMerge,
  steps,
  onRunNext,
  onAddAnotherClip,
  onMergeNow,
  onOpenSupervisedReview,
}: ClipWorkflowSettingsPanelProps): ReactElement {
  return (
    <>
      <div className="flex flex-col gap-1 text-xs">
        <label htmlFor="clip-workflow-prompt" className="text-muted-foreground">
          Prompt
        </label>
        <Textarea
          id="clip-workflow-prompt"
          className="min-h-[72px]"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-2 border border-border p-2">
          <Checkbox
            isChecked={autonomousMode}
            label="Autonomous mode"
            onChange={(e) => onAutonomousModeChange(e.target.checked)}
          />
        </div>
        <div className="flex items-center gap-2 border border-border p-2">
          <Checkbox
            isChecked={requireStepConfirmation}
            label="Confirm each step"
            onChange={(e) => onRequireStepConfirmationChange(e.target.checked)}
          />
        </div>
        <div className="flex items-center gap-2 border border-border p-2">
          <Checkbox
            isChecked={mergeGeneratedVideos}
            label="Merge multiple clips"
            onChange={(e) => onMergeGeneratedVideosChange(e.target.checked)}
          />
        </div>
        <label
          htmlFor="clip-workflow-duration-seconds"
          className="flex items-center gap-2 border border-border p-2"
        >
          <span>Duration (s)</span>
          <Input
            id="clip-workflow-duration-seconds"
            type="number"
            min={5}
            max={60}
            value={durationSeconds}
            onChange={(e) =>
              onDurationSecondsChange(
                Math.max(5, Math.min(60, Number(e.target.value || 30))),
              )
            }
            className="w-16 px-1.5 py-0.5 text-right"
          />
        </label>
      </div>

      {workflows != null && workflows.length > 0 && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Workflow</span>
          <Select
            value={workflowId ?? ''}
            onValueChange={(value) => {
              const nextId = value || undefined;
              onWorkflowIdChange(nextId, nextId ? 'pending' : 'skipped');
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="No workflow binding" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No workflow binding</SelectItem>
              {workflows.map((wf) => (
                <SelectItem key={wf.id} value={wf.id}>
                  {wf.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          onClick={onRunNext}
          isDisabled={!nextNonPublishStep}
        >
          <HiOutlinePlay className="size-3.5" />
          {nextNonPublishStep ? 'Run Next Step' : 'Pipeline Ready'}
        </Button>

        <Button
          variant={ButtonVariant.OUTLINE}
          size={ButtonSize.SM}
          onClick={onAddAnotherClip}
        >
          <HiOutlineBolt className="size-3.5" />
          Generate Another Clip
        </Button>

        {canMerge && (
          <Button
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.SM}
            onClick={onMergeNow}
          >
            <HiOutlineArrowPathRoundedSquare className="size-3.5" />
            Merge Now
          </Button>
        )}

        <Button
          variant={ButtonVariant.OUTLINE}
          size={ButtonSize.SM}
          onClick={onOpenSupervisedReview}
          isDisabled={
            steps.reframe_portrait !== 'completed' ||
            steps.supervised_review === 'completed'
          }
        >
          <HiOutlineSparkles className="size-3.5" />
          Open Supervised Review
        </Button>
      </div>
    </>
  );
}
