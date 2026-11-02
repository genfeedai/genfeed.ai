'use client';

import PromptEmptyState from '@ui/layout/prompt-empty-state/PromptEmptyState';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ClipperPreset } from '@/features/clipper/props/clipper-presets.props';
import { useStudioClipperPage } from '../useStudioClipperPage';
import ClipperInputForm from './ClipperInputForm';
import ClipperPromptCards from './ClipperPromptCards';

/**
 * The left side of the Clipper workspace while no project is open: a centered
 * prompt with the clip styles, and the source bar below. Importing a source
 * saves a project, starts transcription and opens it. A style only chooses
 * how many highlights to look for.
 */
export default function ClipperNewPaneContent() {
  const t = useTranslations('pages.studioClipper');
  const clips = useStudioClipperPage();
  const { setGenerationMode, setMaxClips, setMinViralityScore } = clips;
  const [preset, setPreset] = useState<ClipperPreset>();

  function applyPreset(next: ClipperPreset) {
    setGenerationMode(next.mode);
    setMaxClips(next.maxClips);
    setMinViralityScore(next.minViralityScore);
    setPreset(next);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PromptEmptyState
        description={t('importSourceDescription')}
        title={t('heroTitle')}
      >
        <div className="flex flex-col gap-4">
          <ClipperPromptCards
            isDisabled={clips.isSubmitting}
            onSelect={applyPreset}
          />
          {preset ? (
            <p
              className="text-center text-sm text-muted-foreground"
              role="status"
            >
              {t('presets.appliedStatus', {
                count: preset.maxClips,
                score: preset.minViralityScore,
                title: t(`presets.items.${preset.id}.title`),
              })}
            </p>
          ) : null}
        </div>
      </PromptEmptyState>
      <div className="mt-auto mx-auto w-full max-w-2xl shrink-0 px-3 pb-3">
        <ClipperInputForm
          sourceOnly
          draftSaveState={clips.draftSaveState}
          error={clips.error}
          generationMode={clips.generationMode}
          isSubmitting={clips.isSubmitting}
          maxClips={clips.maxClips}
          minViralityScore={clips.minViralityScore}
          onAnalyze={clips.handleAnalyze}
          onModeChange={clips.setGenerationMode}
          onSetMaxClips={clips.setMaxClips}
          onSetMinViralityScore={clips.setMinViralityScore}
          onSetSourceFile={clips.setSourceFile}
          onSetSourceKind={clips.setSourceKind}
          onSetYoutubeUrl={clips.setYoutubeUrl}
          onStartQuick={clips.handleStartFromYoutube}
          quickStartHint=""
          sourceFile={clips.sourceFile}
          sourceKind={clips.sourceKind}
          uploadProgress={clips.uploadProgress}
          youtubeUrl={clips.youtubeUrl}
        />
      </div>
    </div>
  );
}
