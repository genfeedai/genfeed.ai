'use client';

import {
  ButtonSize,
  ButtonVariant,
  type IngredientFormat,
} from '@genfeedai/enums';
import type { IImage } from '@genfeedai/interfaces';
import type { CameraMovementPreset } from '@genfeedai/interfaces/studio/camera-movement.interface';
import { Button } from '@ui/primitives/button';
import CameraMovementPromptBar from '@ui/studio/frame-sequence/CameraMovementPromptBar';
import FrameSequenceSelector from '@ui/studio/frame-sequence/FrameSequenceSelector';
import { HiSparkles, HiXMark } from 'react-icons/hi2';

interface StoryboardPanelProps {
  cameraMovementPreset: CameraMovementPreset;
  customCameraPrompt: string;
  format: IngredientFormat;
  frames: IImage[];
  hasInterpolationModel: boolean;
  isGenerating: boolean;
  onCameraMovementPresetChange: (preset: CameraMovementPreset) => void;
  onClear: () => void;
  onCustomCameraPromptChange: (prompt: string) => void;
  onFramesChange: (frames: IImage[]) => void;
  onGenerate: () => void;
}

export function StoryboardPanel({
  cameraMovementPreset,
  customCameraPrompt,
  format,
  frames,
  hasInterpolationModel,
  isGenerating,
  onCameraMovementPresetChange,
  onClear,
  onCustomCameraPromptChange,
  onFramesChange,
  onGenerate,
}: StoryboardPanelProps) {
  const transitionCount = Math.max(0, frames.length - 1);
  const generateTooltip = !hasInterpolationModel
    ? 'Select an interpolation-capable video model'
    : transitionCount === 0
      ? 'Select at least two frames'
      : undefined;

  return (
    <section className="mb-5 space-y-3" data-testid="storyboard-panel">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <FrameSequenceSelector
          frames={frames}
          format={format}
          onFramesChange={onFramesChange}
        />
        <CameraMovementPromptBar
          preset={cameraMovementPreset}
          customPrompt={customCameraPrompt}
          onPresetChange={onCameraMovementPresetChange}
          onCustomPromptChange={onCustomCameraPromptChange}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md shadow-border bg-card px-4 py-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{frames.length}</span>{' '}
          frame{frames.length === 1 ? '' : 's'}
          <span className="mx-2 text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground">{transitionCount}</span>{' '}
          transition{transitionCount === 1 ? '' : 's'}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={onClear}
            isDisabled={isGenerating || frames.length === 0}
            icon={<HiXMark />}
            label="Clear"
          />
          <Button
            variant={ButtonVariant.GENERATE}
            size={ButtonSize.SM}
            onClick={onGenerate}
            isDisabled={
              isGenerating || transitionCount === 0 || !hasInterpolationModel
            }
            isLoading={isGenerating}
            icon={<HiSparkles />}
            label="Generate transitions"
            tooltip={generateTooltip}
          />
        </div>
      </div>
    </section>
  );
}
