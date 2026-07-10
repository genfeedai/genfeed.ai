'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { ProviderOption } from '@props/studio/clips.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { HiOutlineMagnifyingGlass, HiOutlineSparkles } from 'react-icons/hi2';

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
];

export default function StudioClipsPage() {
  const {
    avatarId,
    avatarProvider,
    clipsService,
    editedHighlights,
    error,
    handleAnalyze,
    handleGenerate,
    handleStartFromYoutube,
    identityDefaults,
    isSubmitting,
    maxClips,
    minViralityScore,
    project,
    resetToInput,
    selectedCount,
    selectedIds,
    setAvatarId,
    setAvatarProvider,
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
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <HiOutlineMagnifyingGlass className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold text-zinc-100">
              Review Highlights
            </h1>
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            {isAnalyzing
              ? 'Analyzing video -- detecting viral moments...'
              : project.status === 'failed'
                ? 'Analysis failed. Please try again.'
                : `Found ${editedHighlights.length} highlights. Edit scripts, deselect weak clips, then generate.`}
          </p>
        </div>

        {isAnalyzing ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-20">
            <Spinner size={ComponentSize.LG} className="mb-4 text-primary" />
            <p className="text-sm text-zinc-500">
              Transcribing and analyzing video…
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              This usually takes 1-2 minutes
            </p>
          </div>
        ) : project.status === 'failed' ? (
          <div className="rounded-lg border border-transparent bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Analysis failed. Check the YouTube URL and try again.
          </div>
        ) : (
          <>
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

            {/* Avatar & Voice config */}
            <div className="mt-6 space-y-4 rounded-xl bg-secondary p-4 shadow-border">
              <h3 className="text-sm font-medium text-zinc-300">
                Avatar Configuration
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="avatar-id-review"
                    className="mb-1 block text-xs text-zinc-500"
                  >
                    Avatar ID
                  </label>
                  <Input
                    id="avatar-id-review"
                    type="text"
                    value={avatarId}
                    onChange={(e) => setAvatarId(e.target.value)}
                    placeholder="HeyGen avatar ID"
                  />
                </div>
                <div>
                  <label
                    htmlFor="voice-id-review"
                    className="mb-1 block text-xs text-zinc-500"
                  >
                    Voice ID
                  </label>
                  <Input
                    id="voice-id-review"
                    type="text"
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    placeholder="HeyGen voice ID"
                  />
                </div>
              </div>

              <p className="text-xs text-zinc-500">
                {identityDefaults.isComplete
                  ? identityDefaults.source === 'brand'
                    ? 'Using saved brand HeyGen avatar and voice defaults.'
                    : 'Using saved organization HeyGen voice default.'
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
                          ? 'cursor-not-allowed border-zinc-800 bg-zinc-900/30 opacity-50'
                          : 'border-zinc-700 bg-zinc-800/30 hover:border-zinc-600'
                    }`}
                  >
                    <div className="text-xs font-medium text-zinc-200">
                      {opt.label}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {opt.description}
                    </div>
                  </Button>
                ))}
              </div>
            </div>

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
                className="text-sm text-zinc-500 hover:text-zinc-300"
                onClick={resetToInput}
                label="Back"
              />

              <Button
                variant={ButtonVariant.UNSTYLED}
                onClick={handleGenerate}
                isDisabled={
                  isSubmitting || selectedCount === 0 || !avatarId || !voiceId
                }
                isLoading={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
                icon={
                  isSubmitting ? (
                    <Spinner size={ComponentSize.SM} className="text-white" />
                  ) : (
                    <HiOutlineSparkles className="size-4" />
                  )
                }
                label={
                  isSubmitting
                    ? 'Generating…'
                    : `Generate ${selectedCount} clip${selectedCount !== 1 ? 's' : ''} (${selectedCount} credit${selectedCount !== 1 ? 's' : ''})`
                }
              />
            </div>
          </>
        )}

        {project.status === 'failed' && (
          <div className="mt-4">
            <Button
              variant={ButtonVariant.LINK}
              className="text-sm text-zinc-500 hover:text-zinc-300"
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
      youtubeUrl={youtubeUrl}
      onSetYoutubeUrl={setYoutubeUrl}
      maxClips={maxClips}
      onSetMaxClips={setMaxClips}
      minViralityScore={minViralityScore}
      onSetMinViralityScore={setMinViralityScore}
      error={error}
      isSubmitting={isSubmitting}
      onAnalyze={handleAnalyze}
      onStartQuick={handleStartFromYoutube}
      quickStartHint={
        identityDefaults.isComplete
          ? identityDefaults.source === 'brand'
            ? 'Uses saved brand avatar and voice defaults.'
            : 'Uses saved organization voice default.'
          : 'No saved HeyGen defaults. Review highlights first to enter IDs manually.'
      }
    />
  );
}
