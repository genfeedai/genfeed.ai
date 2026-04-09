'use client';

import { ButtonSize, ButtonVariant, IngredientFormat } from '@genfeedai/enums';
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
  Pause,
  Play,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
} from 'lucide-react';
import { HiOutlineFilm, HiOutlineMusicalNote } from 'react-icons/hi2';

export interface EditorToolbarProps {
  projectName: string;
  format: IngredientFormat;
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  zoom: number;
  isDirty: boolean;
  isRendering: boolean;
  onPlayPause: () => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onZoomChange: (zoom: number) => void;
  onFormatChange: (format: IngredientFormat) => void;
  onAddVideoTrack: () => void;
  onAddAudioTrack: () => void;
  onSave: () => void;
  onRender: () => void;
  onBack: () => void;
}

function formatTime(frames: number, fps: number): string {
  const totalSeconds = frames / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const centiseconds = Math.floor((totalSeconds % 1) * 100);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

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

export function EditorToolbar({
  projectName,
  format,
  isPlaying,
  currentFrame,
  totalFrames,
  fps,
  zoom,
  isDirty,
  isRendering,
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
  onRender,
  onBack,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.08] bg-card px-4 py-2">
      {/* Left section - Navigation & Project info */}
      <div className="flex items-center gap-4">
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          onClick={onBack}
          icon={<ArrowLeft className="w-4 h-4" />}
        >
          Back
        </Button>

        <div className="flex items-center gap-2">
          <span className="font-medium">{projectName}</span>
          {isDirty && (
            <span className="text-xs text-muted-foreground">(unsaved)</span>
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
          icon={<SkipBack className="w-4 h-4" />}
        />

        {/* Step back */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={onStepBack}
          tooltip="Previous frame"
          icon={<StepBack className="w-4 h-4" />}
        />

        {/* Play/Pause */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.ICON}
          onClick={onPlayPause}
          tooltip={isPlaying ? 'Pause' : 'Play'}
          className="h-10 w-10 rounded-full"
          icon={
            isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
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
          icon={<StepForward className="w-4 h-4" />}
        />

        {/* Go to end */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={onSeekEnd}
          tooltip="Go to end"
          icon={<SkipForward className="w-4 h-4" />}
        />

        {/* Time display */}
        <div className="ml-4 font-mono text-sm text-muted-foreground">
          {formatTime(currentFrame, fps)} / {formatTime(totalFrames, fps)}
        </div>
      </div>

      {/* Right section - Tools & Actions */}
      <div className="flex items-center gap-3">
        {/* Add Track buttons */}
        <div className="flex items-center gap-1 border-r border-white/[0.08] pr-3">
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            onClick={onAddVideoTrack}
            tooltip="Add Video Track"
            icon={<HiOutlineFilm className="h-4 w-4" />}
          >
            <span className="hidden sm:inline">Video</span>
          </Button>
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            onClick={onAddAudioTrack}
            tooltip="Add Audio Track"
            icon={<HiOutlineMusicalNote className="h-4 w-4" />}
          >
            <span className="hidden sm:inline">Audio</span>
          </Button>
        </div>

        {/* Format selector */}
        <Select
          value={format}
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
          variant={ButtonVariant.OUTLINE}
          size={ButtonSize.SM}
          onClick={onSave}
          isDisabled={!isDirty}
        >
          Save
        </Button>

        {/* Render button */}
        <Button
          withWrapper={false}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          onClick={onRender}
          isDisabled={isRendering}
        >
          {isRendering ? 'Rendering...' : 'Render'}
        </Button>
      </div>
    </div>
  );
}

export default EditorToolbar;
