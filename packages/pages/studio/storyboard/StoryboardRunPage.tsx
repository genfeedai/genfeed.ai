'use client';

import { AlertCategory, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { StoryboardRunPageProps } from '@genfeedai/props/studio/storyboard.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardRunPanel from '@pages/studio/storyboard/components/StoryboardRunPanel';
import StoryboardRunRecipe from '@pages/studio/storyboard/components/StoryboardRunRecipe';
import { useStoryboardRun } from '@pages/studio/storyboard/hooks/use-storyboard-run';
import { buildStoryboardRunEdits } from '@pages/studio/storyboard/utils/storyboard-run';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/** One storyboard run, restored from its latest saved server revision. */
export default function StoryboardRunPage({
  runId,
}: StoryboardRunPageProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.runPage');
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
  const backLink = (
    <Button asChild variant={ButtonVariant.SECONDARY}>
      <Link href={href(APP_ROUTES.STUDIO.STORYBOARD)}>
        {translate('allRuns')}
      </Link>
    </Button>
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
    // The Editor handoff (#5461) adds "Open in Editor" next to `backLink`
    // once the run has an assembled output.
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
