'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type {
  HookClipApprovalAction,
  HookClipApprovalStatus,
} from '@genfeedai/contracts/interfaces';
import type { ProjectState } from '@props/studio/clips.props';
import Card from '@ui/card/Card';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { Check, Film, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ClipsApiService } from '../services/clips-api.service';
import ClipResultCard from './ClipResultCard';

interface ClipsProgressViewProps {
  clipsService: ClipsApiService;
  isRetrying: boolean;
  onReset: () => void;
  onRetryFailedClips: () => void;
  onRetrySource: () => void;
  project: ProjectState;
  selectedCount: number;
}

export default function ClipsProgressView({
  clipsService,
  isRetrying,
  onReset,
  onRetryFailedClips,
  onRetrySource,
  project,
  selectedCount,
}: ClipsProgressViewProps) {
  const t = useTranslations('pages.studioClips');
  const [feedback, setFeedback] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [isDecisionSubmitting, setIsDecisionSubmitting] = useState(false);
  const [submittedApproval, setSubmittedApproval] = useState<{
    sourceAttempt?: number;
    sourceState?: HookClipApprovalStatus['state'];
    status: HookClipApprovalStatus;
  } | null>(null);
  const serverApproval = project.hookApproval;
  const approval =
    submittedApproval &&
    submittedApproval.sourceAttempt === serverApproval?.attempt &&
    submittedApproval.sourceState === serverApproval?.state
      ? submittedApproval.status
      : serverApproval;

  const submitDecision = async (action: HookClipApprovalAction) => {
    setDecisionError(null);
    setIsDecisionSubmitting(true);
    try {
      const result = await clipsService.submitHookApproval(project.projectId, {
        action,
        ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
      });
      setSubmittedApproval({
        sourceAttempt: serverApproval?.attempt,
        sourceState: serverApproval?.state,
        status: result,
      });
      if (action !== 'approve') {
        setFeedback('');
      }
    } catch (error: unknown) {
      setDecisionError(
        error instanceof Error ? error.message : t('hookDecisionFailed'),
      );
    } finally {
      setIsDecisionSubmitting(false);
    }
  };

  const isAwaitingHookApproval = approval?.state === 'awaiting_confirmation';
  const isGeneratingHook = approval?.state === 'generating_hook';
  const pendingDescription =
    selectedCount > 0
      ? project.mode === 'raw-cut'
        ? t('cuttingSelectedHighlights', { count: selectedCount })
        : t('generatingAvatarClips', { count: selectedCount })
      : project.mode === 'raw-cut'
        ? t('processingRawCuts')
        : t('processingAvatarClips');
  const statusHeading = isAwaitingHookApproval
    ? t('reviewHookClip')
    : isGeneratingHook
      ? approval?.lastAction === 'request_changes'
        ? t('regeneratingHookClip')
        : t('generatingHookClip')
      : approval?.state === 'resuming' || approval?.state === 'approved'
        ? t('generatingRemainingClips')
        : approval?.state === 'rejected'
          ? t('hookClipRejected')
          : project.status === 'completed'
            ? t('clipsReady')
            : project.status === 'partially-completed'
              ? t('someClipsAreReady')
              : project.status === 'failed'
                ? t('clipGenerationFailed')
                : t('generatingClips');
  const canRetryFailedClips =
    project.status === 'partially-completed' ||
    (project.status === 'failed' &&
      project.source?.status !== 'failed' &&
      project.clips.some(
        (clip) => clip.status === 'failed' || clip.status === 'degraded',
      ));

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Film className="size-6 text-primary" />
          <h2 className="text-2xl font-semibold text-foreground">
            {statusHeading}
          </h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAwaitingHookApproval
            ? t('remainingClipsAfterApproval', {
                count: approval.remainingClipCount,
              })
            : isGeneratingHook
              ? t('hookOnlyGenerating')
              : approval?.state === 'resuming' || approval?.state === 'approved'
                ? t('hookApprovedReuse')
                : approval?.state === 'rejected'
                  ? (approval.feedback ?? t('runStoppedBeforeRemaining'))
                  : project.status === 'completed' ||
                      project.status === 'partially-completed'
                    ? t('doneClipCount', { count: project.clips.length })
                    : project.status === 'failed'
                      ? t('pipelineFailed')
                      : pendingDescription}
        </p>

        {project.status !== 'completed' &&
          project.status !== 'partially-completed' &&
          project.status !== 'failed' && (
            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-primary transition-[width] duration-500" />
              </div>
              <span className="text-xs capitalize text-muted-foreground">
                {project.status}
              </span>
            </div>
          )}
      </div>

      {project.source?.status === 'failed' &&
      project.source.failure?.retryable ? (
        <Card bodyClassName="space-y-3 p-5" className="mb-6">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t('sourceProcessingFailed')}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {project.source.failure.message}
            </p>
          </div>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            isDisabled={isRetrying}
            onClick={onRetrySource}
          >
            {t('retrySourceProcessing')}
          </Button>
        </Card>
      ) : null}

      {canRetryFailedClips ? (
        <Card bodyClassName="space-y-3 p-5" className="mb-6">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t('someClipsFailed')}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('retryFailedClipsHint')}
            </p>
          </div>
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            isDisabled={isRetrying}
            onClick={onRetryFailedClips}
          >
            {t('retryFailedClips')}
          </Button>
        </Card>
      ) : null}

      {isAwaitingHookApproval ? (
        <Card bodyClassName="space-y-4 p-5" className="mb-6">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t('hookApproval')}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('hookApprovalDescription')}
            </p>
          </div>
          <Textarea
            aria-label={t('hookReviewFeedbackAria')}
            className="min-h-20 w-full rounded-md"
            placeholder={t('hookReviewPlaceholder')}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
          {decisionError ? (
            <p className="text-sm text-destructive" role="alert">
              {decisionError}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
              isDisabled={isDecisionSubmitting || feedback.trim().length === 0}
              isLoading={isDecisionSubmitting}
              onClick={() => void submitDecision('request_changes')}
              icon={<Sparkles className="size-3.5" />}
            >
              {t('requestChanges')}
            </Button>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
              isDisabled={isDecisionSubmitting}
              isLoading={isDecisionSubmitting}
              onClick={() => void submitDecision('approve')}
              icon={<Check className="size-3.5" />}
            >
              {t('approveHook')}
            </Button>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.DESTRUCTIVE}
              withWrapper={false}
              isDisabled={isDecisionSubmitting || feedback.trim().length === 0}
              isLoading={isDecisionSubmitting}
              onClick={() => void submitDecision('reject')}
              icon={<X className="size-3.5" />}
            >
              {t('rejectRun')}
            </Button>
          </div>
        </Card>
      ) : null}

      {project.clips.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {project.clips.map((clip) => (
            <ClipResultCard
              key={clip.id}
              clip={clip}
              clipsService={clipsService}
              mode={project.mode}
              projectId={project.projectId}
            />
          ))}
        </div>
      ) : (
        project.status !== 'completed' &&
        project.status !== 'partially-completed' &&
        project.status !== 'failed' && (
          <Card bodyClassName="items-center justify-center py-20">
            <Spinner size={ComponentSize.LG} className="mb-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              {project.mode === 'raw-cut'
                ? t('processingCaptionedRawCuts')
                : t('processingAvatarClipsEllipsis')}
            </p>
          </Card>
        )
      )}

      <div className="mt-8">
        <Button
          variant={ButtonVariant.LINK}
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={onReset}
          label={t('backToProjects')}
        />
      </div>
    </div>
  );
}
