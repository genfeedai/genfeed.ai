'use client';

import { useAgentOutputHost } from '@contexts/ui/agent-output-host-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import type {
  StoryboardAgentRequest,
  StoryboardDraftPageProps,
  StoryboardPlanEditorHandle,
  StoryboardSaveIndicatorProps,
} from '@/features/studio/props/storyboard.props';
import StoryboardAgentThread from '@/features/studio/storyboard/components/StoryboardAgentThread';
import StoryboardConflictReview from '@/features/studio/storyboard/components/StoryboardConflictReview';
import StoryboardPlanEditor from '@/features/studio/storyboard/components/StoryboardPlanEditor';
import StoryboardPromptBar from '@/features/studio/storyboard/components/StoryboardPromptBar';
import {
  useStoryboardAutosave,
  useStoryboardDraftOutbox,
} from '@/features/studio/storyboard/hooks/use-storyboard-autosave';
import { getStoryboardEditorSeed } from '@/features/studio/storyboard/utils/storyboard-editor-seed';

const MAX_BRIEF_LENGTH = 2000;

interface DraftRequest {
  /** A new brief to save before drafting; omitted to draft from the saved one. */
  readonly brief?: string;
  /** A change request for a plan that already has shots. */
  readonly instruction?: string;
}

/** Neutral detail page stays separate until existing-run migration is integrated. */
export default function StoryboardDraftPage({
  run,
  transport,
  savePlan,
  saveSource,
  resetPlan,
  approvePlan,
  draftPlan,
  capabilities,
  capabilityError,
  refreshCapabilities,
  quoteStills,
  generateStills,
  longForm,
  slideshow,
}: StoryboardDraftPageProps) {
  const translate = useTranslations('pages.studioStoryboard');
  const translateAction = useTranslations('ui.quickActions');
  const { href } = useOrgUrl();
  const router = useRouter();
  const editor = useRef<StoryboardPlanEditorHandle>(null);
  const draft = useStoryboardDraftOutbox(
    run.config.plan ? transport : undefined,
    run,
  );
  useEffect(() => {
    if (draft.snapshot?.status === 'failed') refreshCapabilities?.();
  }, [draft.snapshot?.status, refreshCapabilities]);
  const sourceAutosave = useStoryboardAutosave({
    binding: draft.source,
    scope: `${run.brandId}:${run.id}:source`,
    initial: {
      revision: run.config.revision,
      value: run.config.sourceSnapshot.selector,
    },
    save: async (snapshot, signal) => {
      if (!saveSource || run.config.scenePipeline)
        throw new Error(translate('draft.sourceNotEditable'));
      const savedPlan = await editor.current?.flush();
      if (signal.aborted) throw new Error(translate('draft.scopeChanged'));
      const saved = await saveSource(
        savedPlan?.revision ?? snapshot.revision,
        snapshot.value,
      );
      if (signal.aborted) throw new Error(translate('draft.scopeChanged'));
      return {
        revision: saved.config.revision,
        value: saved.config.sourceSnapshot.selector,
      };
    },
  });
  const [planStatus, setPlanStatus] =
    useState<StoryboardSaveIndicatorProps['status']>('saved');
  const [navigationError, setNavigationError] = useState<string>();
  const [leaving, setLeaving] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string>();
  const lastRequest = useRef<DraftRequest>({});
  const lastRequestId = useRef<string | undefined>(undefined);
  const nextRequestId = useRef(0);
  const [requests, setRequests] = useState<readonly StoryboardAgentRequest[]>(
    [],
  );
  // On a split page the agent column carries the composer; elsewhere the
  // editor keeps it at the foot of the page.
  const hasAgentColumn = Boolean(useAgentOutputHost());
  const pipeline = run.config.scenePipeline;
  const hasShots = (run.config.plan?.shots.length ?? 0) > 0;
  const isSlideshow = run.config.plan?.kind === 'slideshow';
  const savedBrief =
    sourceAutosave.value.kind === 'brief' ? sourceAutosave.value.brief : '';
  const canCompose =
    Boolean(saveSource) &&
    sourceAutosave.value.kind === 'brief' &&
    !run.config.scenePipeline;
  const editorSeed = getStoryboardEditorSeed({
    isReady:
      pipeline?.state === 'ready' &&
      run.config.state === 'ready' &&
      planStatus === 'saved' &&
      sourceAutosave.status === 'saved' &&
      Boolean(draft.queue) &&
      run.config.revision === draft.snapshot?.revision,
    shotIds: (run.config.plan?.shots ?? []).map((shot) => shot.id),
    videos: Object.fromEntries(
      Object.entries(pipeline?.scenes ?? {}).map(([id, scene]) => [
        id,
        scene.video,
      ]),
    ),
    assembly: pipeline?.assembly
      ? { state: pipeline.state, assetId: pipeline.assembly.assetId }
      : undefined,
  });
  function leave(
    event: MouseEvent<HTMLAnchorElement>,
    destination: string,
    requiresReady = false,
  ) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    if (leaving) return;
    setLeaving(true);
    setNavigationError(undefined);
    void sourceAutosave
      .flush()
      .then(() => editor.current?.flush())
      .then((saved) => {
        if (
          requiresReady &&
          saved?.value.shots.some((shot) => shot.stillFreshness !== 'fresh')
        )
          throw new Error(translate('draft.regenerateBeforeEditor'));
        router.push(destination);
      })
      .catch(() => setNavigationError(translate('draft.saveBeforeLeave')))
      .finally(() => setLeaving(false));
  }
  function setRequestState(id: string, state: StoryboardAgentRequest['state']) {
    setRequests((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, state } : entry)),
    );
  }
  /**
   * Saves what the composer holds, settles pending edits, then drafts. A retry
   * passes the failed request's id so the thread shows one entry, not two.
   */
  async function runDraft(request: DraftRequest, retryId?: string) {
    lastRequest.current = request;
    const requestId = retryId ?? `request-${++nextRequestId.current}`;
    lastRequestId.current = requestId;
    if (retryId) setRequestState(retryId, 'working');
    else
      setRequests((current) => [
        ...current,
        {
          id: requestId,
          kind: request.instruction ? 'change' : 'brief',
          state: 'working',
          text: request.instruction ?? request.brief ?? savedBrief,
        },
      ]);
    setIsDrafting(true);
    setDraftError(undefined);
    try {
      const brief = request.brief?.slice(0, MAX_BRIEF_LENGTH);
      if (brief !== undefined && brief !== savedBrief)
        sourceAutosave.edit((source) =>
          source.kind === 'brief' ? { ...source, brief } : source,
        );
      await sourceAutosave.flush();
      // The draft is based on the persisted revision, so pending plan edits land first.
      await editor.current?.flush();
      await draftPlan(request.instruction);
      setRequestState(requestId, 'done');
    } catch (caught) {
      setRequestState(requestId, 'failed');
      setDraftError(
        caught instanceof Error && caught.message
          ? caught.message
          : translate('draft.draftFailed'),
      );
    } finally {
      setIsDrafting(false);
    }
  }
  function submitPrompt(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    return runDraft(hasShots ? { instruction: trimmed } : { brief: trimmed });
  }
  const board = (
    <StoryboardPlanEditor
      ref={editor}
      key={`${run.brandId}:${run.id}`}
      run={run}
      draft={draft.plan}
      isDrafting={isDrafting}
      isSourceSaving={leaving || !draft.queue}
      onSaveStatusChange={setPlanStatus}
      savePlan={savePlan}
      resetPlan={resetPlan}
      approvePlan={approvePlan}
      quoteStills={quoteStills}
      generateStills={generateStills}
      longForm={longForm}
      slideshow={slideshow}
      capabilities={capabilities}
      capabilityError={capabilityError}
      refreshCapabilities={refreshCapabilities}
      sourceBrief={savedBrief || undefined}
      onDraftFromBrief={canCompose ? () => void runDraft({}) : undefined}
      actions={
        editorSeed.href ? (
          <Button asChild variant={ButtonVariant.SECONDARY} disabled={leaving}>
            <Link
              href={href(editorSeed.href)}
              onClick={(event) =>
                leave(event, href(editorSeed.href ?? ''), true)
              }
            >
              {translateAction('openInEditor')}
            </Link>
          </Button>
        ) : undefined
      }
      notices={
        <>
          {pipeline?.state === 'ready' && !editorSeed.href ? (
            <p role="status" className="text-sm text-muted-foreground">
              {editorSeed.reason}
            </p>
          ) : null}
          {navigationError ? (
            <p role="alert" className="text-sm text-destructive">
              {navigationError}
            </p>
          ) : null}
          {draft.snapshot?.storageError ? (
            <p role="alert" className="text-sm text-destructive">
              {draft.snapshot.storageError}
            </p>
          ) : null}
          {draft.queue && draft.snapshot ? (
            <StoryboardConflictReview
              conflicts={draft.snapshot.conflicts}
              choices={draft.snapshot.choices}
              choose={draft.queue.choose}
              resolve={draft.queue.resolve}
            />
          ) : null}
        </>
      }
      composer={
        canCompose && !hasAgentColumn ? (
          <StoryboardPromptBar
            error={draftError}
            hasShots={hasShots}
            isDisabled={leaving || !draft.queue || isDrafting}
            isSlideshow={isSlideshow}
            onRetry={() => void runDraft(lastRequest.current)}
            onSubmit={submitPrompt}
          />
        ) : undefined
      }
    />
  );
  return (
    <AgentOutputShell
      agent={
        <StoryboardAgentThread
          canCompose={canCompose}
          error={draftError}
          hasShots={hasShots}
          isDisabled={leaving || !draft.queue || isDrafting}
          isSlideshow={isSlideshow}
          onRetry={() =>
            void runDraft(lastRequest.current, lastRequestId.current)
          }
          onSubmit={submitPrompt}
          requests={requests}
        />
      }
      agentTitle={translate('agentThread.title')}
      outputLabel={translate('agentThread.board')}
    >
      {board}
    </AgentOutputShell>
  );
}
