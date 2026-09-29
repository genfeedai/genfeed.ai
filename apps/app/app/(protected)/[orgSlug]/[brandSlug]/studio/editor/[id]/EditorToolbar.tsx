'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientFormat,
} from '@genfeedai/contracts';
import type { EditorToolbarProps } from '@props/studio/editor-toolbar.props';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Slider } from '@ui/primitives/slider';
import {
  ArrowLeft,
  Film,
  Music,
  Pause,
  Play,
  Redo2,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Undo2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import EditorSaveIndicator from './EditorSaveIndicator';
import { formatPlaybackFrameTime } from './editor-time-format.util';

const FORMAT_OPTIONS = [
  {
    height: 1080,
    label: '16:9',
    value: IngredientFormat.LANDSCAPE,
    width: 1920,
  },
  {
    height: 1920,
    label: '9:16',
    value: IngredientFormat.PORTRAIT,
    width: 1080,
  },
  { height: 1080, label: '1:1', value: IngredientFormat.SQUARE, width: 1080 },
];

function EditorToolbar({
  projectName,
  format,
  isPlaying,
  currentFrame,
  totalFrames,
  fps,
  zoom,
  isDirty,
  saveStatus,
  canUndo,
  canRedo,
  isRendering,
  isReadOnly = false,
  onPlayPause,
  onSeekStart,
  onSeekEnd,
  onStepBack,
  onStepForward,
  onZoomChange,
  onFormatChange,
  onAddVideoTrack,
  onAddAudioTrack,
  onSave,
  onUndo,
  onRedo,
  onRender,
  onBack,
}: EditorToolbarProps) {
  const t = useTranslations('pages.studioEditorLock');
  const translate = useTranslations('pages.studioEditor.toolbar');

  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
      {/* Left section - Navigation & Project info */}
      <div className="flex items-center gap-4">
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          onClick={onBack}
          icon={<ArrowLeft className="size-4" />}
        >
          Back
        </Button>

        <div className="flex items-center gap-2">
          <span className="font-medium">{projectName}</span>
          {isReadOnly ? (
            <span className="text-xs text-muted-foreground">
              {t('readOnlyBadge')}
            </span>
          ) : (
            <EditorSaveIndicator isDirty={isDirty} saveStatus={saveStatus} />
          )}
        </div>
      </div>

      {/* Center section - Playback controls */}
      <div className="flex items-center gap-2">
        {/* Go to start */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={onSeekStart}
          tooltip="Go to start"
          icon={<SkipBack className="size-4" />}
        />

        {/* Step back */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={onStepBack}
          tooltip="Previous frame"
          icon={<StepBack className="size-4" />}
        />

        {/* Play/Pause */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.ICON}
          onClick={onPlayPause}
          tooltip={isPlaying ? 'Pause' : 'Play'}
          className="size-10"
          icon={
            isPlaying ? (
              <Pause className="size-5" />
            ) : (
              <Play className="size-5" />
            )
          }
        />

        {/* Step forward */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={onStepForward}
          tooltip="Next frame"
          icon={<StepForward className="size-4" />}
        />

        {/* Go to end */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={onSeekEnd}
          tooltip="Go to end"
          icon={<SkipForward className="size-4" />}
        />

        {/* Time display */}
        <div className="ml-4 font-mono text-sm text-muted-foreground tabular-nums">
          {formatPlaybackFrameTime(currentFrame, fps)} /{' '}
          {formatPlaybackFrameTime(totalFrames, fps)}
        </div>
      </div>

      {/* Right section - Tools & Actions */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 border-r border-border pr-3">
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            onClick={onUndo}
            isDisabled={!canUndo}
            ariaLabel={translate('undo')}
            tooltip={translate('undoTooltip')}
            icon={<Undo2 className="size-4" />}
          />
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            onClick={onRedo}
            isDisabled={!canRedo}
            ariaLabel={translate('redo')}
            tooltip={translate('redoTooltip')}
            icon={<Redo2 className="size-4" />}
          />
        </div>

        {/* Add Track buttons */}
        <div className="flex items-center gap-1 border-r border-border pr-3">
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            onClick={onAddVideoTrack}
            isDisabled={isReadOnly}
            tooltip="Add Video Track"
            icon={<Film className="size-4" />}
          >
            <span className="hidden sm:inline">Video</span>
          </Button>
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            onClick={onAddAudioTrack}
            isDisabled={isReadOnly}
            tooltip="Add Audio Track"
            icon={<Music className="size-4" />}
          >
            <span className="hidden sm:inline">Audio</span>
          </Button>
        </div>

        {/* Format selector */}
        <Select
          value={format}
          disabled={isReadOnly}
          onValueChange={(value) => onFormatChange(value as IngredientFormat)}
        >
          <SelectTrigger className="w-24">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            {FORMAT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Zoom slider */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Slider
            min={0.5}
            max={5}
            step={0.1}
            value={[zoom]}
            onValueChange={([value]) => onZoomChange(value)}
            className="w-20"
          />
        </div>

        {/* Save button */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          onClick={onSave}
          isDisabled={!isDirty || isReadOnly}
        >
          Save
        </Button>

        {/* Render button */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          onClick={onRender}
          isDisabled={isRendering || isReadOnly}
        >
          {isRendering ? 'Rendering...' : 'Render'}
        </Button>
      </div>
    </div>
  );
}

export default EditorToolbar;
