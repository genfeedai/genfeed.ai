'use client';

import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/contracts';
import { StoryboardPanel } from '@pages/studio/generate/components/StoryboardPanel';
import MergeProgressPanel from '@pages/studio/storyboard/components/MergeProgressPanel';
import MergeSettingsPanel from '@pages/studio/storyboard/components/MergeSettingsPanel';
import SceneFrameRow from '@pages/studio/storyboard/components/SceneFrameRow';
import {
  type StoryboardWorkspaceMode,
  useStoryboardWorkspace,
} from '@pages/studio/storyboard/use-storyboard-workspace';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import {
  Clapperboard,
  Film,
  Layers2,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
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

export default function StoryboardWorkspace() {
  const { openGallery } = useGalleryModal();
  const {
    addMergeVideos,
    addSceneImages,
    cameraMovementPreset,
    cancelSceneGeneration,
    clearInterpolate,
    clearMergeVideos,
    clearScenes,
    completedSceneCount,
    customCameraPrompt,
    dismissMergeProgress,
    failedSceneCount,
    format,
    generatePendingScenes,
    handleGenerateStoryboard,
    hasInterpolationModel,
    interpolateFrames,
    isGeneratingScenes,
    isMerging,
    isStoryboardGenerating,
    mergeProgress,
    mergeSelectedVideos,
    mergeSettings,
    mergeSteps,
    mergeStoryboardVideos,
    mergeVideoIds,
    mode,
    pendingSceneCount,
    removeMergeVideo,
    removeSceneFrame,
    retryFailedScenes,
    retrySceneFrame,
    sceneProgress,
    setCameraMovementPreset,
    setCustomCameraPrompt,
    setFormat,
    setInterpolateFrames,
    setMode,
    storyboard,
    updateMergeSettings,
    updateSceneFrame,
  } = useStoryboardWorkspace();

  const openImagePicker = useCallback(() => {
    openGallery({
      category: IngredientCategory.IMAGE,
      format,
      maxSelectableItems: 20,
      onSelect: (selected) => {
        addSceneImages(selected ?? []);
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
        addMergeVideos(selected ?? []);
      },
      title: 'Select videos to merge',
    });
  }, [addMergeVideos, format, openGallery]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionTopbar title="Storyboard" />
      <Container>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Build multi-frame video: interpolate stills, script scenes from your
            generated images, or merge finished clips.
          </p>

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
                      isBusy={isGeneratingScenes}
                      onChange={updateSceneFrame}
                      onRemove={removeSceneFrame}
                      onRetry={retrySceneFrame}
                    />
                  ))
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="text-xs text-muted-foreground">
                    {sceneProgress
                      ? `Generating scene ${sceneProgress.current} of ${sceneProgress.total}`
                      : `${storyboard.frames.length} scenes · ${pendingSceneCount} ready · ${completedSceneCount} completed${
                          failedSceneCount > 0
                            ? ` · ${failedSceneCount} failed`
                            : ''
                        }`}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                      icon={<Plus className="size-3.5" />}
                      label="Add images"
                      onClick={openImagePicker}
                      isDisabled={isGeneratingScenes}
                    />
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                      icon={<X className="size-3.5" />}
                      label="Clear"
                      onClick={clearScenes}
                      isDisabled={
                        storyboard.frames.length === 0 || isGeneratingScenes
                      }
                    />
                    {/* Cancelling is only meaningful mid-batch, and the batch is
                        the only thing that can be cancelled — so this replaces
                        "Generate scenes" rather than sitting next to it. */}
                    {isGeneratingScenes ? (
                      <Button
                        size={ButtonSize.SM}
                        variant={ButtonVariant.DESTRUCTIVE}
                        icon={<Square className="size-3.5" />}
                        label="Cancel"
                        onClick={cancelSceneGeneration}
                      />
                    ) : (
                      <>
                        {failedSceneCount > 0 ? (
                          <Button
                            size={ButtonSize.SM}
                            variant={ButtonVariant.SECONDARY}
                            icon={<RotateCcw className="size-3.5" />}
                            label={`Retry failed (${failedSceneCount})`}
                            onClick={() => void retryFailedScenes()}
                          />
                        ) : null}
                        <Button
                          size={ButtonSize.SM}
                          variant={ButtonVariant.DEFAULT}
                          icon={<Sparkles className="size-3.5" />}
                          label="Generate scenes"
                          onClick={() => void generatePendingScenes()}
                          isDisabled={pendingSceneCount === 0}
                        />
                      </>
                    )}
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.DEFAULT}
                      icon={<Layers2 className="size-3.5" />}
                      label="Merge clips"
                      onClick={() => void mergeStoryboardVideos()}
                      isLoading={isMerging}
                      isDisabled={completedSceneCount < 2 || isGeneratingScenes}
                    />
                  </div>
                </div>

                <MergeSettingsPanel
                  isDisabled={isMerging}
                  settings={mergeSettings}
                  onChange={updateMergeSettings}
                />

                <MergeProgressPanel
                  overallProgress={mergeProgress}
                  steps={mergeSteps}
                  onDismiss={dismissMergeProgress}
                />
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
                          {video.metadataLabel ||
                            video.promptText ||
                            video.text ||
                            video.id}
                        </span>
                        <Button
                          size={ButtonSize.ICON}
                          variant={ButtonVariant.GHOST}
                          ariaLabel={`Remove ${video.metadataLabel || video.id}`}
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

                <MergeSettingsPanel
                  isDisabled={isMerging}
                  settings={mergeSettings}
                  onChange={updateMergeSettings}
                />

                <MergeProgressPanel
                  overallProgress={mergeProgress}
                  steps={mergeSteps}
                  onDismiss={dismissMergeProgress}
                />
              </div>
            </Card>
          ) : null}
        </div>
      </Container>
    </div>
  );
}
