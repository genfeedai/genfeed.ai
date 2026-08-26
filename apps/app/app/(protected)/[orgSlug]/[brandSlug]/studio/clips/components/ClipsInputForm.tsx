'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { ClipsInputFormProps } from '@props/studio/clips.props';
import Card from '@ui/card/Card';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { CirclePlay, Search, Sparkles, Upload } from 'lucide-react';

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
  onSetSourceFile,
  onSetSourceKind,
  onSetYoutubeUrl,
  quickStartHint,
  sourceFile,
  sourceKind,
  uploadProgress,
  youtubeUrl,
}: ClipsInputFormProps) {
  const hasSource =
    sourceKind === 'youtube'
      ? youtubeUrl.trim().length > 0
      : Boolean(sourceFile);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Card bodyClassName="space-y-5 p-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">
            Source
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              aria-pressed={sourceKind === 'youtube'}
              onClick={() => onSetSourceKind('youtube')}
              className={`rounded-lg border px-4 py-3 text-sm ${
                sourceKind === 'youtube'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-secondary text-muted-foreground'
              }`}
              icon={<CirclePlay className="size-4" />}
              label="YouTube URL"
            />
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              aria-pressed={sourceKind === 'upload'}
              onClick={() => onSetSourceKind('upload')}
              className={`rounded-lg border px-4 py-3 text-sm ${
                sourceKind === 'upload'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-secondary text-muted-foreground'
              }`}
              icon={<Upload className="size-4" />}
              label="Upload audio or video"
            />
          </div>
        </fieldset>

        {sourceKind === 'youtube' ? (
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
        ) : (
          <div>
            <label
              htmlFor="clip-source-file"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Audio or video file
            </label>
            <Input
              id="clip-source-file"
              type="file"
              accept="audio/*,video/*"
              onChange={(event) =>
                onSetSourceFile(event.target.files?.[0] ?? null)
              }
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Supports long-form audio and video up to 10 GB and 6 hours.
            </p>
            {sourceFile ? (
              <p className="mt-2 text-xs text-foreground" role="status">
                {sourceFile.name} · {(sourceFile.size / 1024 / 1024).toFixed(1)}{' '}
                MB
              </p>
            ) : null}
            {isSubmitting && uploadProgress > 0 ? (
              <div
                className="mt-3"
                aria-label={`Upload ${uploadProgress}% complete`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={uploadProgress}
                role="progressbar"
              >
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Uploading source… {uploadProgress}%
                </p>
              </div>
            ) : null}
          </div>
        )}

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
          <div className="mt-1 flex justify-between text-2xs text-muted-foreground/70">
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
          <div className="mt-1 flex justify-between text-2xs text-muted-foreground/70">
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
            isDisabled={isSubmitting || !hasSource}
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
                isDisabled={isSubmitting || !hasSource}
                className="text-xs text-muted-foreground hover:text-foreground"
                icon={<Search className="size-3.5" />}
                label="Review highlights first"
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
