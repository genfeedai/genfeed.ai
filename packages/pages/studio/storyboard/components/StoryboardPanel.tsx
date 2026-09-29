'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardPanelProps } from '@genfeedai/props/studio/storyboard.props';
import { Button } from '@ui/primitives/button';
import CameraMovementPromptBar from '@ui/studio/frame-sequence/CameraMovementPromptBar';
import FrameSequenceSelector from '@ui/studio/frame-sequence/FrameSequenceSelector';
import { Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
  const translate = useTranslations('pages.studioStoryboard.frameSequence');
  const transitionCount = Math.max(0, frames.length - 1);
  const generateTooltip = !hasInterpolationModel
    ? translate('needsInterpolationModel')
    : transitionCount === 0
      ? translate('needsTwoFrames')
      : undefined;

  return (
    <section className="mb-5 space-y-3" data-testid="storyboard-panel">
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-card px-4 py-3 shadow-border">
        <div className="text-sm text-muted-foreground">
          {translate('summary', {
            frames: frames.length,
            transitions: transitionCount,
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={onClear}
            isDisabled={isGenerating || frames.length === 0}
            icon={<X />}
            label={translate('clear')}
          />
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            onClick={onGenerate}
            isDisabled={
              isGenerating || transitionCount === 0 || !hasInterpolationModel
            }
            isLoading={isGenerating}
            icon={<Sparkles />}
            label={translate('generate')}
            tooltip={generateTooltip}
          />
        </div>
      </div>
    </section>
  );
}
