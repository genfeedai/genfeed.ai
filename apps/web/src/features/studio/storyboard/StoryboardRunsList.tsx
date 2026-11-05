'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { CreativeAppAgentContext } from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Container from '@ui/layout/container/Container';
import { useCreativeProjectsPresence } from '@ui/layout/creative-app-workspace/CreativeAppWorkspace';
import CreativeProjectsEmptyState from '@ui/layout/creative-app-workspace/CreativeProjectsEmptyState';
import { formatThreadTime } from '@ui/lists/thread-list/group-by-recency';
import {
  ThreadListRecencySections,
  ThreadListRow,
  ThreadListSection,
  ThreadListSubtitle,
} from '@ui/lists/thread-list/ThreadList';
import { Button } from '@ui/primitives/button';
import { Clapperboard } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, type ReactElement, useMemo, useState } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import type { StoryboardListRun } from '@/features/studio/props/storyboard.props';
import { useStoryboardRuns } from '@/features/studio/storyboard/hooks/use-storyboard-runs';
import { isStoryboardRunNeedingAttention } from '@/features/studio/storyboard/utils/storyboard-run-summary';
import { useCreativeAppAgentContext } from '@/hooks/agent/use-creative-app-agent-context/use-creative-app-agent-context';

/**
 * The right side of the Storyboard workspace while no run is open: every saved
 * storyboard run of the brand. A row opens the run; starting one happens in
 * the prompt on the left.
 */
export default function StoryboardRunsList(): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.runs');
  const locale = useLocale();
  const { href } = useOrgUrl();
  const [search, setSearch] = useState('');
  const { error, hasMore, isLoading, loadMore, runs } =
    useStoryboardRuns(search);
  const isSearching = search.trim() !== '';
  // The agent hears about the runs on screen once the list has loaded, so a
  // change request is never matched against a half-known list.
  const creativeApp = useMemo<CreativeAppAgentContext | null>(
    () =>
      isLoading || error
        ? null
        : {
            app: 'storyboard',
            projects: runs.map((run) => ({ id: run.id, title: run.title })),
          },
    [error, isLoading, runs],
  );
  useCreativeAppAgentContext(creativeApp);
  const needsAttention = runs.filter(isStoryboardRunNeedingAttention);
  const otherRuns = runs.filter((run) => !isStoryboardRunNeedingAttention(run));

  function row(run: StoryboardListRun): ReactElement {
    return (
      <ThreadListRow
        data-testid="storyboard-run-row"
        href={href(
          `${APP_ROUTES.STUDIO.STORYBOARD}/${encodeURIComponent(run.id)}`,
        )}
        status={isStoryboardRunNeedingAttention(run) ? 'attention' : 'idle'}
        statusLabel={
          isStoryboardRunNeedingAttention(run) ? translate('needsYou') : undefined
        }
        subtitle={
          <ThreadListSubtitle
            parts={[
              translate(
                `sourceKinds.${'sourceLabel' in run ? run.sourceLabel : run.sourceKind}`,
              ),
              'phase' in run
                ? translate(`phases.${run.phase}`)
                : translate.has?.(`states.${run.state}`)
                  ? translate(`states.${run.state}`)
                  : run.state.replaceAll('_', ' '),
              translate('shotCount', { count: run.shotCount }),
              run.runtimeSeconds === null
                ? null
                : translate('runtime', { seconds: run.runtimeSeconds }),
            ]}
          />
        }
        time={formatThreadTime(run.updatedAt, locale)}
        title={run.title}
      />
    );
  }

  const isEmpty = !isLoading && runs.length === 0 && !error;
  useCreativeProjectsPresence(
    runs.length > 0
      ? 'populated'
      : isEmpty && !isSearching
        ? 'empty'
        : 'unknown',
  );

  return (
    <Container
      label={translate('title')}
      leading={
        <SearchField
          ariaLabel={translate('search')}
          onSearch={setSearch}
          placeholder={translate('search')}
          value={search}
        />
      }
      moduleChrome
      titleVisibility="sr-only"
    >
      <div className="flex flex-col gap-2">
        {error ? <p role="alert">{error}</p> : null}
        {isEmpty && isSearching ? (
          <CreativeProjectsEmptyState
            icon={Clapperboard}
            title={translate('emptySearch')}
          />
        ) : null}
        {isEmpty && !isSearching ? (
          <CreativeProjectsEmptyState
            description={translate('emptyDescription')}
            icon={Clapperboard}
            title={translate('emptyTitle')}
          />
        ) : null}
        <ThreadListSection
          data-testid="storyboard-needs-you"
          itemCount={needsAttention.length}
          title={translate('needsYou')}
        >
          {needsAttention.map((run) => (
            <Fragment key={run.id}>{row(run)}</Fragment>
          ))}
        </ThreadListSection>
        <ThreadListRecencySections
          getDate={(run) => run.updatedAt}
          getKey={(run) => run.id}
          items={otherRuns}
          renderRow={row}
        />
        {hasMore || error ? (
          <Button isDisabled={isLoading} onClick={loadMore}>
            {translate(error ? 'retryLoad' : 'more')}
          </Button>
        ) : null}
      </div>
    </Container>
  );
}
