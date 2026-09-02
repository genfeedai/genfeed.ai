'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  ClipsWorkspaceProps,
  ProviderOption,
} from '@props/studio/clips.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Plus, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import ClipModeSelector from './components/ClipModeSelector';
import ClipReferenceFrameSelector from './components/ClipReferenceFrameSelector';
import ClipsInputForm from './components/ClipsInputForm';
import ClipsProgressView from './components/ClipsProgressView';
import ClipsProjectList from './components/ClipsProjectList';
import HighlightReviewCard from './components/HighlightReviewCard';
import { useStudioClipProjects } from './useStudioClipProjects';
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
  {
    description: 'Managed generation',
    disabled: false,
    label: 'GenfeedAI',
    value: 'genfeedai',
  },
];

export default function ClipsWorkspace({ projectId }: ClipsWorkspaceProps) {
  const t = useTranslations('pages.studioClips');
  const searchParams = useSearchParams();
  const { href } = useOrgUrl();
  const [isCreating, setIsCreating] = useState(searchParams.get('new') === '1');
  const {
    error: listError,
    isLoading: isListLoading,
    projects,
  } = useStudioClipProjects({ isEnabled: !projectId });
  const clipsPage = useStudioClipsPage({ projectId });
  const {
    error,
    generationMode,
    handleAnalyze,
    handleStartFromYoutube,
    identityDefaults,
    isSubmitting,
    maxClips,
    minViralityScore,
    setGenerationMode,
    setMaxClips,
    setMinViralityScore,
    setSourceFile,
    setSourceKind,
    setYoutubeUrl,
    sourceFile,
    sourceKind,
    uploadProgress,
    youtubeUrl,
  } = clipsPage;

  const hasProjects = projects.length > 0;
  const showCreateForm =
    !projectId && (isCreating || (!isListLoading && !hasProjects));
  const listHref = href(APP_ROUTES.STUDIO.CLIPS);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionTopbar
        title="Clips"
        actions={
          projectId ? (
            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              label={t('allProjects')}
            >
              <Link href={listHref}>{t('allProjects')}</Link>
            </Button>
          ) : hasProjects ? (
            <Button
              size={ButtonSize.SM}
              variant={
                showCreateForm ? ButtonVariant.SECONDARY : ButtonVariant.DEFAULT
              }
              icon={showCreateForm ? undefined : <Plus className="size-3.5" />}
              label={showCreateForm ? 'All projects' : 'New project'}
              onClick={() => setIsCreating((current) => !current)}
            />
          ) : null
        }
      />

      <Container>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t('description')}</p>

          {projectId ? (
            <ClipsProjectDetail {...clipsPage} />
          ) : showCreateForm ? (
            <ClipsInputForm
              generationMode={generationMode}
              youtubeUrl={youtubeUrl}
              onSetYoutubeUrl={setYoutubeUrl}
              maxClips={maxClips}
              onSetMaxClips={setMaxClips}
              minViralityScore={minViralityScore}
              onSetMinViralityScore={setMinViralityScore}
              onSetSourceFile={setSourceFile}
              onSetSourceKind={setSourceKind}
              error={error}
              isSubmitting={isSubmitting}
              onAnalyze={handleAnalyze}
              onCancel={hasProjects ? () => setIsCreating(false) : undefined}
              onModeChange={setGenerationMode}
              onStartQuick={handleStartFromYoutube}
              quickStartHint={
                generationMode === 'raw-cut'
                  ? 'Uses the source footage and burns captions. No avatar defaults required.'
                  : identityDefaults.isComplete
                    ? 'Uses configured avatar and voice defaults.'
                    : 'No saved HeyGen defaults. Review highlights first to enter IDs manually.'
              }
              sourceFile={sourceFile}
              sourceKind={sourceKind}
              uploadProgress={uploadProgress}
            />
          ) : (
            <>
              {listError ? (
                <div className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                  {listError}
                </div>
              ) : null}
              <ClipsProjectList isLoading={isListLoading} projects={projects} />
            </>
          )}
        </div>
      </Container>
    </div>
  );
}

function ClipsProjectDetail({
  avatarId,
  avatarProvider,
  clipsService,
  editedHighlights,
  error,
  generationMode,
  handleGenerate,
  handleRetryFailedClips,
  handleRetrySource,
  handleSelectReferenceFrame,
  identityDefaults,
  isHydrating,
  isSubmitting,
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
  setVoiceId,
  step,
  toggleHighlight,
  updateHighlightScript,
  updateHighlightTitle,
  voiceId,
}: ReturnType<typeof useStudioClipsPage>) {
  if (isHydrating) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner size={ComponentSize.LG} className="text-primary" />
      </div>
    );
  }

  if (step === 'progress' && project) {
    return (
      <ClipsProgressView
        project={project}
        isRetrying={isSubmitting}
        selectedCount={project.estimatedClips ?? selectedCount}
        clipsService={clipsService}
        onReset={resetToInput}
        onRetryFailedClips={handleRetryFailedClips}
        onRetrySource={handleRetrySource}
      />
    );
  }

  if (step === 'review' && project) {
    const isAnalyzing =
      project.status !== 'analyzed' && project.status !== 'failed';
    const isManagedProvider = avatarProvider === 'genfeedai';
    const hasSelectedReference = Boolean(
      project.referenceFrames?.selectedCandidateId,
    );

    return (
      <div className="mx-auto w-full max-w-4xl">
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
                  projectId={project.projectId}
                  clipsService={clipsService}
                />
              ))}
            </div>

            <div className="mt-6 rounded-md bg-secondary p-4 shadow-border">
              <ClipModeSelector
                mode={generationMode}
                onModeChange={setGenerationMode}
              />
            </div>

            {generationMode === 'avatar' ? (
              <div className="mt-4 space-y-4 rounded-md bg-secondary p-4 shadow-border">
                <h3 className="text-sm font-medium text-foreground">
                  Avatar Configuration
                </h3>
                {!isManagedProvider ? (
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
                        onChange={(event) => setAvatarId(event.target.value)}
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
                        onChange={(event) => setVoiceId(event.target.value)}
                        placeholder={`${avatarProvider === 'argil' ? 'Argil' : 'HeyGen'} voice ID`}
                      />
                    </div>
                  </div>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  {isManagedProvider
                    ? hasSelectedReference
                      ? 'Uses the selected reference frame through managed GenfeedAI generation.'
                      : 'Select a reference frame above. Managed GenfeedAI access must also be enabled for this deployment.'
                    : avatarProvider === 'argil'
                      ? 'Enter the avatar and voice IDs from your Argil account.'
                      : identityDefaults.isComplete
                        ? 'Using configured HeyGen identity defaults and overrides.'
                        : `Missing ${identityDefaults.missing.join(' and ')} defaults. Enter IDs manually or save them in brand defaults.`}
                </p>

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
            ) : null}

            {error ? (
              <div className="mt-4 rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                {error}
              </div>
            ) : null}

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
                  (generationMode === 'avatar' &&
                    (isManagedProvider
                      ? !hasSelectedReference
                      : !avatarId || !voiceId))
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

        {project.status === 'failed' ? (
          <div className="mt-4">
            <Button
              variant={ButtonVariant.LINK}
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={resetToInput}
              label="Try again"
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
      Loading project…
    </div>
  );
}
