'use client';

import { AlertCategory, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { StoryboardRunPageProps } from '@genfeedai/props/studio/storyboard.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardRunPanel from '@pages/studio/storyboard/components/StoryboardRunPanel';
import StoryboardRunRecipe from '@pages/studio/storyboard/components/StoryboardRunRecipe';
import { useDurableStoryboardRun } from '@pages/studio/storyboard/hooks/use-durable-storyboard-run';
import { useStoryboardCapabilities } from '@pages/studio/storyboard/hooks/use-storyboard-capabilities';
import { useStoryboardRun } from '@pages/studio/storyboard/hooks/use-storyboard-run';
import StoryboardDraftPage from '@pages/studio/storyboard/StoryboardDraftPage';
import { getStoryboardEditorSeed } from '@pages/studio/storyboard/utils/storyboard-editor-seed';
import { buildStoryboardRunEdits } from '@pages/studio/storyboard/utils/storyboard-run';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/** One storyboard run, restored from its latest saved server revision. */
export function LegacyStoryboardRunPage({
  runId,
}: StoryboardRunPageProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.runPage');
  const translateAction = useTranslations('ui.quickActions');
  const { href } = useOrgUrl();
  const {
    attachSceneSource,
    cancelScenes,
    error,
    executeScenes,
    preparePausedDraft,
    quoteScenes,
    refresh,
    resumeScenes,
    run,
    saveScenes,
    start,
    status,
    submitForReview,
    vary,
  } = useStoryboardRun(runId);
  const pipeline = run?.scenePipeline;
  const editorSeed = getStoryboardEditorSeed({
    isReady: pipeline?.state === 'ready',
    shotIds:
      run?.concept?.storyboard.map(
        (shot) => shot.id ?? `unavailable-shot-${shot.ordinal}`,
      ) ?? [],
    videos: Object.fromEntries(
      Object.entries(pipeline?.scenes ?? {}).map(([id, shot]) => [
        id,
        shot.video,
      ]),
    ),
    assembly: pipeline?.assembly
      ? { state: pipeline.state, assetId: pipeline.assembly.assetId }
      : undefined,
  });
  const backLink = (
    <div className="flex flex-wrap items-center gap-2">
      {pipeline?.state === 'ready' ? (
        editorSeed.href ? (
          <Button asChild variant={ButtonVariant.SECONDARY}>
            <Link href={href(editorSeed.href)}>
              {translateAction('openInEditor')}
            </Link>
          </Button>
        ) : (
          <span
            role="status"
            className="max-w-sm text-xs text-muted-foreground"
          >
            {editorSeed.reason}
          </span>
        )
      ) : null}
      <Button asChild variant={ButtonVariant.SECONDARY}>
        <Link href={href(APP_ROUTES.STUDIO.STORYBOARD)}>
          {translate('allRuns')}
        </Link>
      </Button>
    </div>
  );

  if (!run) {
    return (
      <Container label={translate('title')} right={backLink}>
        {status === 'error' ? (
          <div className="flex flex-col items-start gap-3">
            <Alert type={AlertCategory.ERROR}>
              {error ?? translate('loadFailed')}
            </Alert>
            <Button
              label={translate('retry')}
              onClick={() => void refresh()}
              variant={ButtonVariant.SECONDARY}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            {translate('loading')}
          </p>
        )}
      </Container>
    );
  }

  const isWorking = status === 'working';

  return (
    <Container label={run.sourceSnapshot.title} right={backLink}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <StoryboardRunRecipe
          isWorking={isWorking}
          key={`${run.id}:${run.revision}`}
          onGenerate={(recipe) => {
            void start(buildStoryboardRunEdits(run, recipe));
          }}
          run={run}
        />
        <StoryboardRunPanel
          error={error}
          isWorking={isWorking}
          onPreparePaidDraft={() => {
            const { selector } = run.sourceSnapshot;
            if (
              selector.kind !== 'connected_ad' ||
              selector.platform !== 'meta'
            ) {
              return;
            }
            void preparePausedDraft({
              destination: {
                adAccountId: selector.adAccountId,
                credentialId: selector.credentialId,
              },
            });
          }}
          onReview={(variantIds) => {
            void submitForReview(variantIds);
          }}
          onVary={() => {
            void vary();
          }}
          run={run}
          sceneActions={{
            attachSceneSource,
            cancelScenes,
            executeScenes,
            quoteScenes,
            resumeScenes,
            saveScenes,
          }}
        />
      </div>
    </Container>
  );
}

/** Native drafts use the neutral API; existing Discovery runs remain reachable until migration. */
export default function StoryboardRunPage({
  runId,
}: StoryboardRunPageProps): ReactElement {
  const {
    run,
    error,
    notFound,
    refresh,
    savePlan,
    saveSource,
    transport,
    resetPlan,
    approvePlan,
  } = useDurableStoryboardRun(runId);
  const modelCapabilities = useStoryboardCapabilities(
    runId,
    run?.config.revision,
  );
  if (notFound) return <LegacyStoryboardRunPage runId={runId} />;
  if (run)
    return (
      <StoryboardDraftPage
        run={run}
        transport={transport}
        savePlan={savePlan}
        saveSource={saveSource}
        resetPlan={resetPlan}
        approvePlan={approvePlan}
        {...modelCapabilities}
      />
    );
  return (
    <Container label="Storyboard">
      <div className="mx-auto max-w-5xl space-y-3">
        {error ? (
          <>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button
              label="Retry loading"
              variant={ButtonVariant.SECONDARY}
              onClick={refresh}
            />
          </>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading storyboard…
          </p>
        )}
      </div>
    </Container>
  );
}
