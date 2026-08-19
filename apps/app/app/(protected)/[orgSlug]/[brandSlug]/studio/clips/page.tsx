'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { ProviderOption } from '@props/studio/clips.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Search, Sparkles } from 'lucide-react';

import ClipModeSelector from './components/ClipModeSelector';
import ClipReferenceFrameSelector from './components/ClipReferenceFrameSelector';
import ClipsInputForm from './components/ClipsInputForm';
import ClipsProgressView from './components/ClipsProgressView';
import HighlightReviewCard from './components/HighlightReviewCard';
import { useStudioClipsPage } from './useStudioClipsPage';

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    description: 'Best Quality',
    disabled: false,
    label: 'HeyGen',
    value: 'heygen',
  },
  {
    description: 'Atom avatars',
    disabled: false,
    label: 'Argil',
    value: 'argil',
  },
];

export default function StudioClipsPage() {
  const {
    avatarId,
    avatarProvider,
    clipsService,
    editedHighlights,
    error,
    generationMode,
    handleAnalyze,
    handleGenerate,
    handleSelectReferenceFrame,
    handleStartFromYoutube,
    identityDefaults,
    isSubmitting,
    maxClips,
    minViralityScore,
    pendingReferenceFrameId,
    project,
    referenceFrameError,
    resetToInput,
    retryReferenceFrameSelection,
    selectedCount,
    selectedIds,
    setAvatarId,
    setAvatarProvider,
    setGenerationMode,
    setMaxClips,
    setMinViralityScore,
    setVoiceId,
    setYoutubeUrl,
    step,
    toggleHighlight,
    updateHighlightScript,
    updateHighlightTitle,
    voiceId,
    youtubeUrl,
  } = useStudioClipsPage();

  // ═══════════════════════════════════════════════════════════════
  // Step 3: Progress view
  // ═══════════════════════════════════════════════════════════════
  if (step === 'progress' && project) {
    return (
      <ClipsProgressView
        project={project}
        selectedCount={project.estimatedClips ?? selectedCount}
        clipsService={clipsService}
        onReset={resetToInput}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Step 2: Review highlights
  // ═══════════════════════════════════════════════════════════════
  if (step === 'review' && project) {
    const isAnalyzing =
      project.status !== 'analyzed' && project.status !== 'failed';

    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="sr-only">Clips</h1>
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <Search className="size-6 text-primary" />
            <h2 className="text-2xl font-semibold text-foreground">
              Review Highlights
            </h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAnalyzing
              ? 'Analyzing video -- detecting viral moments...'
              : project.status === 'failed'
                ? 'Analysis failed. Please try again.'
                : `Found ${editedHighlights.length} highlights. Edit scripts, deselect weak clips, then generate.`}
          </p>
        </div>

        {isAnalyzing ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
            <Spinner size={ComponentSize.LG} className="mb-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              Transcribing and analyzing video…
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              This usually takes 1-2 minutes
            </p>
          </div>
        ) : project.status === 'failed' ? (
          <div className="rounded-lg border border-transparent bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Analysis failed. Check the YouTube URL and try again.
          </div>
        ) : (
          <>
            <div className="mb-6">
              <ClipReferenceFrameSelector
                error={referenceFrameError}
                onRetry={retryReferenceFrameSelection}
                onSelect={(candidateId) =>
                  void handleSelectReferenceFrame(candidateId)
                }
                pendingCandidateId={pendingReferenceFrameId}
                referenceFrames={project.referenceFrames}
              />
            </div>

            <div className="space-y-3">
              {editedHighlights.map((highlight) => (
                <HighlightReviewCard
                  key={highlight.id}
                  highlight={highlight}
                  selected={selectedIds.has(highlight.id)}
                  onToggle={() => toggleHighlight(highlight.id)}
                  onTitleEdit={(text) =>
                    updateHighlightTitle(highlight.id, text)
                  }
                  onScriptEdit={(text) =>
                    updateHighlightScript(highlight.id, text)
                  }
                  projectId={project?.projectId}
                  clipsService={clipsService}
                />
              ))}
            </div>

            <div className="mt-6 rounded-xl bg-secondary p-4 shadow-border">
              <ClipModeSelector
                mode={generationMode}
                onModeChange={setGenerationMode}
              />
            </div>

            {/* Avatar & Voice config */}
            {generationMode === 'avatar' && (
              <div className="mt-4 space-y-4 rounded-xl bg-secondary p-4 shadow-border">
                <h3 className="text-sm font-medium text-foreground">
                  Avatar Configuration
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="avatar-id-review"
                      className="mb-1 block text-xs text-muted-foreground"
                    >
                      Avatar ID
                    </label>
                    <Input
                      id="avatar-id-review"
                      type="text"
                      value={avatarId}
                      onChange={(e) => setAvatarId(e.target.value)}
                      placeholder={`${avatarProvider === 'argil' ? 'Argil' : 'HeyGen'} avatar ID`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="voice-id-review"
                      className="mb-1 block text-xs text-muted-foreground"
                    >
                      Voice ID
                    </label>
                    <Input
                      id="voice-id-review"
                      type="text"
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      placeholder={`${avatarProvider === 'argil' ? 'Argil' : 'HeyGen'} voice ID`}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {avatarProvider === 'argil'
                    ? 'Enter the avatar and voice IDs from your Argil account.'
                    : identityDefaults.isComplete
                      ? 'Using configured HeyGen identity defaults and overrides.'
                      : `Missing ${identityDefaults.missing.join(' and ')} defaults. Enter IDs manually or save them in brand defaults.`}
                </p>

                {/* Provider */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PROVIDER_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={ButtonVariant.UNSTYLED}
                      isDisabled={opt.disabled}
                      onClick={() => setAvatarProvider(opt.value)}
                      className={`relative rounded-lg border px-3 py-2 text-left transition-colors ${
                        avatarProvider === opt.value
                          ? 'border-primary bg-primary/10'
                          : opt.disabled
                            ? 'cursor-not-allowed border-border bg-muted/30 opacity-50'
                            : 'border-border bg-secondary hover:border-primary/60'
                      }`}
                    >
                      <div className="text-xs font-medium text-foreground">
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {opt.description}
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-4 rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Generate button */}
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant={ButtonVariant.LINK}
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={resetToInput}
                label="Back"
              />

              <Button
                variant={ButtonVariant.DEFAULT}
                onClick={handleGenerate}
                isDisabled={
                  isSubmitting ||
                  selectedCount === 0 ||
                  (generationMode === 'avatar' && (!avatarId || !voiceId))
                }
                isLoading={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
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
                label={
                  isSubmitting
                    ? 'Generating…'
                    : `Generate ${selectedCount} ${generationMode === 'raw-cut' ? 'raw cut' : 'avatar clip'}${selectedCount !== 1 ? 's' : ''} (${selectedCount} credit${selectedCount !== 1 ? 's' : ''})`
                }
              />
            </div>
          </>
        )}

        {project.status === 'failed' && (
          <div className="mt-4">
            <Button
              variant={ButtonVariant.LINK}
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={resetToInput}
              label="Try again"
            />
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Step 1: Input form
  // ═══════════════════════════════════════════════════════════════
  return (
    <ClipsInputForm
      generationMode={generationMode}
      youtubeUrl={youtubeUrl}
      onSetYoutubeUrl={setYoutubeUrl}
      maxClips={maxClips}
      onSetMaxClips={setMaxClips}
      minViralityScore={minViralityScore}
      onSetMinViralityScore={setMinViralityScore}
      error={error}
      isSubmitting={isSubmitting}
      onAnalyze={handleAnalyze}
      onModeChange={setGenerationMode}
      onStartQuick={handleStartFromYoutube}
      quickStartHint={
        generationMode === 'raw-cut'
          ? 'Uses the source footage and burns captions. No avatar defaults required.'
          : identityDefaults.isComplete
            ? 'Uses configured avatar and voice defaults.'
            : 'No saved HeyGen defaults. Review highlights first to enter IDs manually.'
      }
    />
  );
}
