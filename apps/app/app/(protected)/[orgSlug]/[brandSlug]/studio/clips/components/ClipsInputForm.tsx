'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { ClipsInputFormProps } from '@props/studio/clips.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Search, Sparkles } from 'lucide-react';

import ClipModeSelector from './ClipModeSelector';

export default function ClipsInputForm({
  error,
  generationMode,
  isSubmitting,
  maxClips,
  minViralityScore,
  onAnalyze,
  onCancel,
  onModeChange,
  onStartQuick,
  onSetMaxClips,
  onSetMinViralityScore,
  onSetYoutubeUrl,
  quickStartHint,
  youtubeUrl,
}: ClipsInputFormProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="space-y-5 rounded-xl bg-card p-6 shadow-border">
        {/* YouTube URL */}
        <div>
          <label
            htmlFor="youtube-url"
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            YouTube URL
          </label>
          <Input
            id="youtube-url"
            type="url"
            value={youtubeUrl}
            onChange={(e) => onSetYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>

        <ClipModeSelector mode={generationMode} onModeChange={onModeChange} />

        {/* Max Clips Slider */}
        <div>
          <label
            htmlFor="max-clips"
            className="mb-1.5 flex items-center justify-between text-sm font-medium text-foreground"
          >
            <span>Max Clips</span>
            <span className="text-xs text-muted-foreground">{maxClips}</span>
          </label>
          <Input
            id="max-clips"
            type="range"
            min={1}
            max={30}
            value={maxClips}
            onChange={(e) => onSetMaxClips(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/70">
            <span>1</span>
            <span>15</span>
            <span>30</span>
          </div>
        </div>

        {/* Min Virality Score */}
        <div>
          <label
            htmlFor="min-virality"
            className="mb-1.5 flex items-center justify-between text-sm font-medium text-foreground"
          >
            <span>Min Virality Score</span>
            <span className="text-xs text-muted-foreground">
              {minViralityScore}
            </span>
          </label>
          <Input
            id="min-virality"
            type="range"
            min={0}
            max={100}
            value={minViralityScore}
            onChange={(e) => onSetMinViralityScore(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/70">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <Button
            variant={ButtonVariant.UNSTYLED}
            onClick={onStartQuick}
            isDisabled={isSubmitting || !youtubeUrl}
            isLoading={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            icon={
              isSubmitting ? (
                <Spinner
                  size={ComponentSize.SM}
                  className="text-primary-foreground"
                />
              ) : (
                <Sparkles className="size-4" />
              )
            }
            label={isSubmitting ? 'Starting…' : 'Start Clip Factory'}
          />

          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground">{quickStartHint}</p>
            <div className="flex items-center gap-3">
              {onCancel ? (
                <Button
                  variant={ButtonVariant.LINK}
                  onClick={onCancel}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  label="Cancel"
                />
              ) : null}
              <Button
                variant={ButtonVariant.LINK}
                onClick={onAnalyze}
                isDisabled={isSubmitting || !youtubeUrl}
                className="text-xs text-muted-foreground hover:text-foreground"
                icon={<Search className="size-3.5" />}
                label="Review highlights first"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
