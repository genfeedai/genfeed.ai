'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  StoryboardDraftPageProps,
  StoryboardPlanEditorHandle,
  StoryboardSaveIndicatorProps,
} from '@genfeedai/props/studio/storyboard.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardConflictReview from '@pages/studio/storyboard/components/StoryboardConflictReview';
import StoryboardPlanEditor from '@pages/studio/storyboard/components/StoryboardPlanEditor';
import StoryboardSaveIndicator from '@pages/studio/storyboard/components/StoryboardSaveIndicator';
import {
  useStoryboardAutosave,
  useStoryboardDraftOutbox,
} from '@pages/studio/storyboard/hooks/use-storyboard-autosave';
import { getStoryboardEditorSeed } from '@pages/studio/storyboard/utils/storyboard-editor-seed';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Textarea } from '@ui/primitives/textarea';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type MouseEvent, useRef, useState } from 'react';

/** Neutral detail page stays separate until existing-run migration is integrated. */
export default function StoryboardDraftPage({
  run,
  transport,
  savePlan,
  saveSource,
  resetPlan,
  approvePlan,
  capabilities,
  capabilityError,
  refreshCapabilities,
}: StoryboardDraftPageProps) {
  const { href } = useOrgUrl();
  const router = useRouter();
  const editor = useRef<StoryboardPlanEditorHandle>(null);
  const draft = useStoryboardDraftOutbox(transport, run);
  const sourceAutosave = useStoryboardAutosave({
    binding: draft.source,
    scope: `${run.brandId}:${run.id}:source`,
    initial: {
      revision: run.config.revision,
      value: run.config.sourceSnapshot.selector,
    },
    save: async (snapshot, signal) => {
      if (!saveSource || run.config.scenePipeline)
        throw new Error('This source cannot be edited.');
      const savedPlan = await editor.current?.flush();
      if (signal.aborted) throw new Error('Storyboard scope changed.');
      const saved = await saveSource(
        savedPlan?.revision ?? snapshot.revision,
        snapshot.value,
      );
      if (signal.aborted) throw new Error('Storyboard scope changed.');
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
  const pipeline = run.config.scenePipeline;
  const editorSeed = getStoryboardEditorSeed({
    isReady:
      pipeline?.state === 'ready' &&
      run.config.state === 'ready' &&
      planStatus === 'saved' &&
      sourceAutosave.status === 'saved' &&
      Boolean(draft.queue),
    shotIds: run.config.plan.shots.map((shot) => shot.id),
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
          throw new Error(
            'Storyboard changed. Regenerate stale shots before opening Editor.',
          );
        router.push(destination);
      })
      .catch(() =>
        setNavigationError(
          'Your edits could not be saved. Retry saving before leaving.',
        ),
      )
      .finally(() => setLeaving(false));
  }
  const backHref = href(APP_ROUTES.STUDIO.STORYBOARD);
  const back = (
    <Button asChild variant={ButtonVariant.SECONDARY} disabled={leaving}>
      <Link href={backHref} onClick={(event) => leave(event, backHref)}>
        All storyboards
      </Link>
    </Button>
  );
  return (
    <Container
      label={run.config.plan.title || 'Storyboard'}
      right={
        <div className="flex flex-wrap gap-2">
          {editorSeed.href ? (
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              disabled={leaving}
            >
              <Link
                href={href(editorSeed.href)}
                onClick={(event) =>
                  leave(event, href(editorSeed.href ?? ''), true)
                }
              >
                Open in Editor
              </Link>
            </Button>
          ) : null}
          {back}
        </div>
      }
    >
      <div className="mx-auto w-full max-w-5xl space-y-4">
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
        {saveSource &&
        sourceAutosave.value.kind === 'brief' &&
        !run.config.scenePipeline ? (
          <Card
            label="Brief"
            description="Source changes mark existing stills stale and require a new review."
          >
            <Field
              label="Brief"
              helpText={`${sourceAutosave.value.brief.length}/2,000 characters`}
            >
              <Textarea
                value={sourceAutosave.value.brief}
                maxLength={2000}
                disabled={leaving || !draft.queue}
                onChange={(event) => {
                  const brief = event.target.value;
                  sourceAutosave.edit((source) =>
                    source.kind === 'brief' ? { ...source, brief } : source,
                  );
                }}
              />
            </Field>
            <div className="mt-3">
              <StoryboardSaveIndicator
                status={sourceAutosave.status}
                error={sourceAutosave.error}
                onRetry={() =>
                  void sourceAutosave.flush().catch(() => undefined)
                }
              />
            </div>
          </Card>
        ) : null}
        <StoryboardPlanEditor
          ref={editor}
          key={`${run.brandId}:${run.id}`}
          run={run}
          draft={draft.plan}
          isSourceSaving={leaving || !draft.queue}
          onSaveStatusChange={setPlanStatus}
          savePlan={savePlan}
          resetPlan={resetPlan}
          approvePlan={approvePlan}
          capabilities={capabilities}
          capabilityError={capabilityError}
          refreshCapabilities={refreshCapabilities}
        />
      </div>
    </Container>
  );
}
