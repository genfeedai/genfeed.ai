'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { HiOutlineSparkles } from 'react-icons/hi2';
import type { WorkspaceTaskMode } from './workspace-task-composer.constants';

interface TaskPreset {
  label: string;
  outputType:
    | 'post'
    | 'newsletter'
    | 'image'
    | 'video'
    | 'facecam'
    | 'caption'
    | 'ingredient';
}

interface TaskModeOption {
  description: string;
  id: WorkspaceTaskMode;
  label: string;
}

interface WorkspaceTaskToolbarProps {
  isEnhancementBusy: boolean;
  hasPreviousRequest: boolean;
  hasRequest: boolean;
  modeOptions: TaskModeOption[];
  onEnhance: () => void;
  onOutputTypeChange: (outputType: TaskPreset['outputType']) => void;
  onTaskModeChange: (mode: WorkspaceTaskMode) => void;
  onUndoEnhancement: () => void;
  outputType: TaskPreset['outputType'];
  presets: TaskPreset[];
  taskMode: WorkspaceTaskMode;
}

export function WorkspaceTaskToolbar({
  isEnhancementBusy,
  hasPreviousRequest,
  hasRequest,
  modeOptions,
  onEnhance,
  onOutputTypeChange,
  onTaskModeChange,
  onUndoEnhancement,
  outputType,
  presets,
  taskMode,
}: WorkspaceTaskToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((preset) => (
        <Button
          key={preset.outputType}
          size={ButtonSize.XS}
          variant={
            outputType === preset.outputType
              ? ButtonVariant.DEFAULT
              : ButtonVariant.SECONDARY
          }
          className="font-semibold uppercase tracking-[0.12em]"
          disabled={taskMode !== 'standard'}
          onClick={() => onOutputTypeChange(preset.outputType)}
        >
          {preset.label}
        </Button>
      ))}
      <span className="h-4 w-px bg-white/10" />
      {modeOptions.map((mode) => (
        <Button
          key={mode.id}
          size={ButtonSize.XS}
          variant={
            taskMode === mode.id
              ? ButtonVariant.DEFAULT
              : ButtonVariant.SECONDARY
          }
          className="font-semibold"
          onClick={() => onTaskModeChange(mode.id)}
        >
          {mode.label}
        </Button>
      ))}
      <div className="ml-auto flex items-center gap-1.5">
        {hasPreviousRequest ? (
          <Button
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
            className="px-2 text-xs text-foreground/55"
            onClick={onUndoEnhancement}
          >
            Undo
          </Button>
        ) : null}
        <Button
          size={ButtonSize.XS}
          variant={ButtonVariant.GHOST}
          className="px-2 text-xs text-foreground/70"
          disabled={isEnhancementBusy || !hasRequest}
          onClick={onEnhance}
        >
          <HiOutlineSparkles className="size-3.5" />
          {isEnhancementBusy ? 'Enhancing…' : 'Enhance - 1 credit'}
        </Button>
      </div>
    </div>
  );
}
