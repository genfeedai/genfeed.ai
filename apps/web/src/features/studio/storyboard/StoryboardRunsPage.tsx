'use client';

import { ButtonVariant, ViewType } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionView from '@ui/collection/CollectionView';
import CollectionViewToggle from '@ui/collection/CollectionViewToggle';
import Container from '@ui/layout/container/Container';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, type ReactElement, useState } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import type { StoryboardListRun } from '@/features/studio/props/storyboard.props';
import StoryboardPresetShelf from '@/features/studio/storyboard/components/StoryboardPresetShelf';
import StoryboardRunsOnboarding from '@/features/studio/storyboard/components/StoryboardRunsOnboarding';
import { useStoryboardRuns } from '@/features/studio/storyboard/hooks/use-storyboard-runs';
import { isStoryboardRunNeedingAttention } from '@/features/studio/storyboard/utils/storyboard-run-summary';
import { useCollectionViewPreference } from '@/hooks/utils/use-collection-view-preference/use-collection-view-preference';

/** Studio → Storyboard landing: every saved storyboard run of the brand. */
export default function StoryboardRunsPage(): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.runs');
  const locale = useLocale();
  const { href } = useOrgUrl();
  const [search, setSearch] = useState('');
  const { error, hasMore, isLoading, loadMore, runs } =
    useStoryboardRuns(search);
  const { view, setView } = useCollectionViewPreference({
    defaultView: ViewType.LIST,
    surface: 'studio.storyboard',
  });
  const isSearching = search.trim() !== '';
  const needsAttention = runs.filter(isStoryboardRunNeedingAttention);

  function runHref(run: StoryboardListRun): string {
    return href(
      `${APP_ROUTES.STUDIO.STORYBOARD}/${encodeURIComponent(run.id)}`,
    );
  }

  function actions(run: StoryboardListRun): ReactElement {
    return (
      <CollectionItemActions
        primary={
          <Button asChild variant={ButtonVariant.SECONDARY}>
            <Link
              aria-label={translate('openRun', { title: run.title })}
              href={runHref(run)}
            >
              {translate('open')}
            </Link>
          </Button>
        }
      />
    );
  }

  function facts(run: StoryboardListRun): ReactElement {
    return (
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
          <span>{translate('runtime', { seconds: run.runtimeSeconds })}</span>
        )}
        <span>
          {translate('lastEdited', {
            time: new Date(run.updatedAt).toLocaleString(locale),
          })}
        </span>
      </>
    );
  }

  function row(run: StoryboardListRun): ReactElement {
    return (
      <ListRow
        data-testid="storyboard-run-row"
        density="compact"
        meta={facts(run)}
        title={run.title}
        trailing={actions(run)}
      />
    );
  }

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
      right={
        <div className="flex items-center gap-2">
          <CollectionViewToggle onViewChange={setView} view={view} />
          <Button asChild>
            <Link href={href(APP_ROUTES.STUDIO.STORYBOARD_NEW)}>
              {translate('new')}
            </Link>
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        {error ? <p role="alert">{error}</p> : null}
        {!isLoading && runs.length === 0 && !error && !isSearching ? (
          <StoryboardRunsOnboarding />
        ) : null}
        {runs.length > 0 || isSearching ? <StoryboardPresetShelf /> : null}
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
        {isSearching && !isLoading && runs.length === 0 && !error ? (
          <p>{translate('emptySearch')}</p>
        ) : null}
        <CollectionSection
          isLoading={isLoading}
          itemCount={runs.length}
          title={translate('all')}
        >
          <CollectionView
            getItemKey={(run) => run.id}
            isLoading={isLoading && runs.length === 0}
            items={runs}
            renderGridItem={(run) => (
              <Card label={run.title}>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {facts(run)}
                </div>
                {actions(run)}
              </Card>
            )}
            renderListItem={row}
            view={view}
          />
        </CollectionSection>
        {hasMore || error ? (
          <Button isDisabled={isLoading} onClick={loadMore}>
            {translate(error ? 'retryLoad' : 'more')}
          </Button>
        ) : null}
      </div>
    </Container>
  );
}
