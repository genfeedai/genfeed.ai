'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ViewType,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import type {
  ClipperWorkspaceProps,
  ProviderOption,
} from '@props/studio/clipper.props';
import CollectionViewToggle from '@ui/collection/CollectionViewToggle';
import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import Spinner from '@ui/primitives/spinner';
import { Plus, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import ClipperInputForm from './components/ClipperInputForm';
import ClipperModeSelector from './components/ClipperModeSelector';
import ClipperOnboarding from './components/ClipperOnboarding';
import ClipperPresetShelf from './components/ClipperPresetShelf';
import ClipperProgressView from './components/ClipperProgressView';
import ClipperProjectList from './components/ClipperProjectList';
import ClipperReferenceFrameSelector from './components/ClipperReferenceFrameSelector';
import ClipperSourcePreview from './components/ClipperSourcePreview';
import HighlightReviewCard from './components/HighlightReviewCard';
import { useStudioClipperPage } from './useStudioClipperPage';
import { useStudioClipperProjects } from './useStudioClipperProjects';

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

export default function ClipperWorkspace({ projectId }: ClipperWorkspaceProps) {
  const t = useTranslations('pages.studioClipper');
  const { href } = useOrgUrl();
  const {
    error: listError,
    renameProject,
    deleteProject,
    isLoading: isListLoading,
    projects,
  } = useStudioClipperProjects({ isEnabled: !projectId });
  const clipperPage = useStudioClipperPage({ projectId });
  const searchParams = useSearchParams();
  const isFirstPage = (Number(searchParams.get('page')) || 1) === 1;

  const { view, setView } = useCollectionViewPreference({
    defaultView: ViewType.LIST,
    surface: 'studio.clipper',
  });

  const hasProjects = projects.length > 0;
  const listHref = href(APP_ROUTES.STUDIO.CLIPPER);
  const newProjectHref = href(APP_ROUTES.STUDIO.CLIPPER_NEW);
  const topbarActions = projectId ? (
    <Button
      asChild
      size={ButtonSize.SM}
      variant={ButtonVariant.SECONDARY}
      label={t('allProjects')}
    >
      <Link href={listHref}>{t('allProjects')}</Link>
    </Button>
  ) : hasProjects ? (
    <div className="flex items-center gap-2">
      <CollectionViewToggle onViewChange={setView} view={view} />
      <Button
        asChild
        size={ButtonSize.SM}
        variant={ButtonVariant.DEFAULT}
        label={t('newProject')}
      >
        <Link href={newProjectHref}>
          <Plus className="size-3.5" />
          {t('newProject')}
        </Link>
      </Button>
    </div>
  ) : undefined;

  const workspace = (
    <Container label="Clipper" titleVisibility="sr-only" right={topbarActions}>
      <div className="flex w-full flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('description')}</p>

        {projectId ? (
          <ClipperProjectDetail {...clipperPage} />
        ) : (
          <>
            {listError ? (
              <div className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                {listError}
              </div>
            ) : null}
            {!isListLoading && !hasProjects && !listError ? (
              <ClipperOnboarding />
            ) : (
              <>
                {hasProjects ? <ClipperPresetShelf /> : null}
                <ClipperProjectList
                  isLoading={isListLoading}
                  isRecentVisible={isFirstPage}
                  projects={projects}
                  view={view}
                  onRename={renameProject}
                  onDelete={deleteProject}
                />
                {hasProjects && !isListLoading ? (
                  <AutoPagination showTotal totalLabel="projects" />
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </Container>
  );

  // A project opens with the agent on the left and the source, clips and
  // transcript on the right. The list stays a full-width page.
  return projectId ? (
    <AgentOutputShell>{workspace}</AgentOutputShell>
  ) : (
    workspace
  );
}

function ClipperProjectDetail(props: ReturnType<typeof useStudioClipperPage>) {
  const t = useTranslations('pages.studioClipper');
  const { orgHref } = useOrgUrl();
  if (props.isHydrating || !props.project)
    return <ClipperProjectControls {...props} />;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="min-w-0">
        <ClipperSourcePreview
          name={props.project.name}
          sourceVideoUrl={props.project.sourceVideoUrl || props.youtubeUrl}
          transcriptText={props.project.transcriptText}
          source={props.project.source}
        />
      </div>
      <div className="min-w-0 space-y-4">
        {props.step !== 'input' &&
        props.project.source?.flow !== 'review' &&
        props.generationMode === 'avatar' &&
        !props.identityDefaults.isComplete ? (
          <p className="text-sm text-muted-foreground">
            {t('avatarDefaultsHint')}{' '}
            <Link
              href={orgHref(APP_ROUTES.SETTINGS.PREFERENCES)}
              className="underline"
            >
              {t('configureAvatarDefaults')}
            </Link>
          </p>
        ) : null}
        <ClipperProjectControls {...props} />
      </div>
    </div>
  );
}

function ClipperProjectControls({
  avatarId,
  avatarProvider,
  clipsService,
  draftFilename,
  draftSaveState,
  editedHighlights,
  error,
  generationMode,
  handleAnalyze,
  handleGenerate,
  handleRetryFailedClips,
  handleRetrySource,
  handleSelectReferenceFrame,
  handleStartFromYoutube,
  identityDefaults,
  isHydrating,
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
  setSourceFile,
  setSourceKind,
  setVoiceId,
  setYoutubeUrl,
  sourceFile,
  sourceKind,
  step,
  toggleHighlight,
  updateHighlightScript,
  updateHighlightTitle,
  uploadProgress,
  voiceId,
  youtubeUrl,
}: ReturnType<typeof useStudioClipperPage>) {
  const t = useTranslations('pages.studioClipper');
  if (isHydrating) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner size={ComponentSize.LG} className="text-primary" />
      </div>
    );
  }

  if (step === 'input' && project) {
    return (
      <ClipperInputForm
        sourceOnly={project.status === 'draft'}
        draftFilename={draftFilename}
        draftSaveState={draftSaveState}
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
    );
  }

  if (step === 'progress' && project) {
    return (
      <ClipperProgressView
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
    const isSourceRetryExhausted = Boolean(
      project.source && project.source.retryCount >= project.source.maxRetries,
    );
    const hasSelectedReference = Boolean(
      project.referenceFrames?.selectedCandidateId,
    );

    return (
      <div className="w-full">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <Search className="size-6 text-primary" />
            <h2 className="text-2xl font-semibold text-foreground">
              Review Highlights
            </h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAnalyzing
              ? t('processingSource')
              : project.status === 'failed'
                ? 'Analysis failed. Please try again.'
                : `Found ${editedHighlights.length} highlights. Edit scripts, deselect weak clips, then generate.`}
          </p>
        </div>

        {isAnalyzing ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
            <Spinner size={ComponentSize.LG} className="mb-4 text-primary" />
            <p role="status" className="text-sm text-muted-foreground">
              {project.source?.status === 'downloading'
                ? t('downloadingSource')
                : project.source?.status === 'extracting'
                  ? t('extractingSourceAudio')
                  : t('transcribingAndAnalyzingSource')}
            </p>
          </div>
        ) : project.status === 'failed' ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-transparent bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {project.source?.failure?.message ??
                project.error ??
                t('sourceProcessingFailed')}
            </div>
            {project.source?.status === 'failed' &&
            project.source.failure?.retryable ? (
              <>
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                  isDisabled={isSubmitting || isSourceRetryExhausted}
                  onClick={handleRetrySource}
                >
                  {t('retrySourceProcessing')}
                </Button>
                {isSourceRetryExhausted ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    {t('sourceRetryLimitReached')}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mb-6">
              <ClipperReferenceFrameSelector
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

            <div className="mt-6 rounded-md bg-muted p-4 shadow-border">
              <ClipperModeSelector
                mode={generationMode}
                onModeChange={setGenerationMode}
              />
            </div>

            {generationMode === 'avatar' ? (
              <div className="mt-4 space-y-4 rounded-md bg-muted p-4 shadow-border">
                <h3 className="text-sm font-medium text-foreground">
                  Avatar Configuration
                </h3>
                {!isManagedProvider ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="avatar-id-review"
                        className="text-xs text-muted-foreground font-normal"
                      >
                        Avatar ID
                      </Label>
                      <Input
                        id="avatar-id-review"
                        type="text"
                        value={avatarId}
                        onChange={(event) => setAvatarId(event.target.value)}
                        placeholder={`${avatarProvider === 'argil' ? 'Argil' : 'HeyGen'} avatar ID`}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="voice-id-review"
                        className="text-xs text-muted-foreground font-normal"
                      >
                        Voice ID
                      </Label>
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
                            ? 'cursor-not-allowed border-border bg-muted/20 opacity-50'
                            : 'border-border bg-muted hover:border-primary/60'
                      }`}
                    >
                      <div className="text-xs font-medium text-foreground">
                        {opt.label}
                      </div>
                      <div className="text-2xs text-muted-foreground">
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
              label={t('backToProjects')}
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
