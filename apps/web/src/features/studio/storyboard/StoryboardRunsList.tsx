'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import Container from '@ui/layout/container/Container';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, type ReactElement, useState } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import type { StoryboardListRun } from '@/features/studio/props/storyboard.props';
import { useStoryboardRuns } from '@/features/studio/storyboard/hooks/use-storyboard-runs';
import { isStoryboardRunNeedingAttention } from '@/features/studio/storyboard/utils/storyboard-run-summary';

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
  const needsAttention = runs.filter(isStoryboardRunNeedingAttention);

  function row(run: StoryboardListRun): ReactElement {
    return (
      <ListRow
        data-testid="storyboard-run-row"
        density="compact"
        href={href(
          `${APP_ROUTES.STUDIO.STORYBOARD}/${encodeURIComponent(run.id)}`,
        )}
        meta={
          <>
            <span>
              {translate(
                `sourceKinds.${'sourceLabel' in run ? run.sourceLabel : run.sourceKind}`,
              )}
            </span>
            <span>
              {'phase' in run
                ? translate(`phases.${run.phase}`)
                : translate.has?.(`states.${run.state}`)
                  ? translate(`states.${run.state}`)
                  : run.state.replaceAll('_', ' ')}
            </span>
            <span>{translate('shotCount', { count: run.shotCount })}</span>
            {run.runtimeSeconds === null ? null : (
              <span>
                {translate('runtime', { seconds: run.runtimeSeconds })}
              </span>
            )}
            <span>
              {translate('lastEdited', {
                time: new Date(run.updatedAt).toLocaleString(locale),
              })}
            </span>
          </>
        }
        title={run.title}
      />
    );
  }

  const isEmpty = !isLoading && runs.length === 0 && !error;

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
      <div className="flex flex-col gap-8">
        {error ? <p role="alert">{error}</p> : null}
        {isEmpty && isSearching ? <p>{translate('emptySearch')}</p> : null}
        {isEmpty && !isSearching ? (
          <EmptyState
            description={translate('emptyDescription')}
            title={translate('emptyTitle')}
          />
        ) : null}
        {needsAttention.length > 0 ? (
          <CollectionSection
            itemCount={needsAttention.length}
            title={translate('needsYou')}
          >
            <CollectionList>
              {needsAttention.map((run) => (
                <Fragment key={run.id}>{row(run)}</Fragment>
              ))}
            </CollectionList>
          </CollectionSection>
        ) : null}
        {runs.length > 0 ? (
          <CollectionSection
            isLoading={isLoading}
            itemCount={runs.length}
            title={translate('all')}
          >
            <CollectionList>
              {runs.map((run) => (
                <Fragment key={run.id}>{row(run)}</Fragment>
              ))}
            </CollectionList>
          </CollectionSection>
        ) : null}
        {hasMore || error ? (
          <Button isDisabled={isLoading} onClick={loadMore}>
            {translate(error ? 'retryLoad' : 'more')}
          </Button>
        ) : null}
      </div>
    </Container>
  );
}
