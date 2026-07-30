'use client';

import type { StoryboardFrame } from '@genfeedai/client/schemas';
import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/enums';
import type { IImage, IVideo } from '@genfeedai/interfaces';
import { StoryboardPanel } from '@pages/studio/generate/components/StoryboardPanel';
import {
  type StoryboardWorkspaceMode,
  useStoryboardWorkspace,
} from '@pages/studio/storyboard/use-storyboard-workspace';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import {
  Clapperboard,
  Film,
  Layers2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback } from 'react';

const MODE_OPTIONS: Array<{
  id: StoryboardWorkspaceMode;
  label: string;
  description: string;
  icon: typeof Clapperboard;
}> = [
  {
    description: 'Blend stills into transitions with camera moves',
    icon: Film,
    id: 'interpolate',
    label: 'Frame sequence',
  },
  {
    description: 'Image + script per beat, then merge the clips',
    icon: Clapperboard,
    id: 'scenes',
    label: 'Scenes',
  },
  {
    description: 'Stitch finished videos into one timeline',
    icon: Layers2,
    id: 'merge',
    label: 'Merge videos',
  },
];

function SceneFrameRow({
  frame,
  onChange,
  onRemove,
}: {
  frame: StoryboardFrame;
  onChange: (frameId: string, patch: Partial<StoryboardFrame>) => void;
  onRemove: (frameId: string) => void;
}) {
  const thumb = frame.imageThumbnailUrl || frame.imageUrl || frame.videoUrl;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-start">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-background-secondary">
        {thumb ? (
          <Image
            src={thumb}
            alt={`Scene ${frame.order + 1}`}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">
            Scene {frame.order + 1}
          </span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {frame.status ?? 'pending'}
            {frame.error ? ` · ${frame.error}` : ''}
          </span>
        </div>
        <Textarea
          value={frame.prompt ?? ''}
          onChange={(event) =>
            onChange(frame.id, { prompt: event.target.value })
          }
          placeholder="Script / prompt for this frame (what should happen in the clip)"
          className="min-h-20 text-sm"
        />
      </div>

      <Button
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        ariaLabel={`Remove scene ${frame.order + 1}`}
        onClick={() => onRemove(frame.id)}
        icon={<Trash2 className="size-3.5" />}
      />
    </div>
  );
}

export default function StoryboardWorkspace() {
  const { openGallery } = useGalleryModal();
  const {
    addMergeVideos,
    addSceneImages,
    cameraMovementPreset,
    clearInterpolate,
    clearMergeVideos,
    clearScenes,
    completedSceneCount,
    customCameraPrompt,
    format,
    generatePendingScenes,
    handleGenerateStoryboard,
    hasInterpolationModel,
    interpolateFrames,
    isGeneratingScenes,
    isMerging,
    isStoryboardGenerating,
    mergeSelectedVideos,
    mergeStoryboardVideos,
    mergeVideoIds,
    mode,
    pendingSceneCount,
    removeMergeVideo,
    removeSceneFrame,
    setCameraMovementPreset,
    setCustomCameraPrompt,
    setFormat,
    setInterpolateFrames,
    setMode,
    storyboard,
    updateSceneFrame,
  } = useStoryboardWorkspace();

  const openImagePicker = useCallback(() => {
    openGallery({
      category: IngredientCategory.IMAGE,
      format,
      maxSelectableItems: 20,
      onSelect: (selected) => {
        const items = (Array.isArray(selected)
          ? selected
          : selected
            ? [selected]
            : []) as unknown as IImage[];
        addSceneImages(items);
      },
      title: 'Add images to storyboard',
    });
  }, [addSceneImages, format, openGallery]);

  const openVideoPicker = useCallback(() => {
    openGallery({
      category: IngredientCategory.VIDEO,
      format,
      maxSelectableItems: 10,
      onSelect: (selected) => {
        const items = (Array.isArray(selected)
          ? selected
          : selected
            ? [selected]
            : []) as unknown as IVideo[];
        addMergeVideos(items);
      },
      title: 'Select videos to merge',
    });
  }, [addMergeVideos, format, openGallery]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-foreground">
              Storyboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Build multi-frame video: interpolate stills, script scenes from
              your generated images, or merge finished clips.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {MODE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isActive = mode === option.id;
              return (
                <Button
                  key={option.id}
                  type="button"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={() => setMode(option.id)}
                  className={
                    isActive
                      ? 'flex h-auto flex-col items-start gap-1 rounded-md border border-primary/40 bg-foreground/[0.08] px-3 py-3 text-left'
                      : 'flex h-auto flex-col items-start gap-1 rounded-md border border-border bg-card px-3 py-3 text-left hover:bg-foreground/[0.04]'
                  }
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Icon className="size-3.5" />
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Format</span>
            {(
              [
                IngredientFormat.PORTRAIT,
                IngredientFormat.LANDSCAPE,
                IngredientFormat.SQUARE,
              ] as const
            ).map((value) => (
              <Button
                key={value}
                size={ButtonSize.SM}
                variant={
                  format === value
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.SECONDARY
                }
                label={value}
                onClick={() => setFormat(value)}
              />
            ))}
          </div>

          {mode === 'interpolate' ? (
            <StoryboardPanel
              cameraMovementPreset={cameraMovementPreset}
              customCameraPrompt={customCameraPrompt}
              format={format}
              frames={interpolateFrames}
              hasInterpolationModel={hasInterpolationModel}
              isGenerating={isStoryboardGenerating}
              onCameraMovementPresetChange={setCameraMovementPreset}
              onClear={clearInterpolate}
              onCustomCameraPromptChange={setCustomCameraPrompt}
              onFramesChange={setInterpolateFrames}
              onGenerate={handleGenerateStoryboard}
            />
          ) : null}

          {mode === 'scenes' ? (
            <Card
              label="Scenes"
              description="Each scene is an image plus a script. Generate clips, then merge them into one video."
            >
              <div className="flex flex-col gap-3">
                {storyboard.frames.length === 0 ? (
                  <div className="rounded-md bg-background-secondary/50 px-3 py-6 text-center text-sm text-muted-foreground">
                    Add generated images, write a prompt per frame, then
                    generate.
                  </div>
                ) : (
                  storyboard.frames.map((frame) => (
                    <SceneFrameRow
                      key={frame.id}
                      frame={frame}
                      onChange={updateSceneFrame}
                      onRemove={removeSceneFrame}
                    />
                  ))
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="text-xs text-muted-foreground">
                    {storyboard.frames.length} scenes · {pendingSceneCount}{' '}
                    ready · {completedSceneCount} completed
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                      icon={<Plus className="size-3.5" />}
                      label="Add images"
                      onClick={openImagePicker}
                    />
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                      icon={<X className="size-3.5" />}
                      label="Clear"
                      onClick={clearScenes}
                      isDisabled={storyboard.frames.length === 0}
                    />
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.DEFAULT}
                      icon={<Sparkles className="size-3.5" />}
                      label="Generate scenes"
                      onClick={() => void generatePendingScenes()}
                      isLoading={isGeneratingScenes}
                      isDisabled={pendingSceneCount === 0}
                    />
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.DEFAULT}
                      icon={<Layers2 className="size-3.5" />}
                      label="Merge clips"
                      onClick={() => void mergeStoryboardVideos()}
                      isLoading={isMerging}
                      isDisabled={completedSceneCount < 2}
                    />
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          {mode === 'merge' ? (
            <Card
              label="Merge videos"
              description="Pick two or more finished videos and stitch them into one timeline."
            >
              <div className="flex flex-col gap-3">
                {mergeVideoIds.length === 0 ? (
                  <div className="rounded-md bg-background-secondary/50 px-3 py-6 text-center text-sm text-muted-foreground">
                    No videos selected yet.
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {mergeVideoIds.map((video, index) => (
                      <li
                        key={video.id}
                        className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                      >
                        <span className="text-xs text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {video.label || video.id}
                        </span>
                        <Button
                          size={ButtonSize.ICON}
                          variant={ButtonVariant.GHOST}
                          ariaLabel={`Remove ${video.label || video.id}`}
                          icon={<Trash2 className="size-3.5" />}
                          onClick={() => removeMergeVideo(video.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                  <Button
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                    icon={<Plus className="size-3.5" />}
                    label="Add videos"
                    onClick={openVideoPicker}
                  />
                  <Button
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                    icon={<X className="size-3.5" />}
                    label="Clear"
                    onClick={clearMergeVideos}
                    isDisabled={mergeVideoIds.length === 0}
                  />
                  <Button
                    size={ButtonSize.SM}
                    variant={ButtonVariant.DEFAULT}
                    icon={<Layers2 className="size-3.5" />}
                    label="Merge"
                    onClick={() => void mergeSelectedVideos()}
                    isLoading={isMerging}
                    isDisabled={mergeVideoIds.length < 2}
                  />
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
