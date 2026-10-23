'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { DataSource } from '@genfeedai/props/workflows/workflow-templates-page.props';
import Card from '@ui/card/Card';
import CollectionCarouselSection from '@ui/collection/CollectionCarouselSection';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import CollectionView from '@ui/collection/CollectionView';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo } from 'react';
import { workflowCollectionHeaderTabs } from '../workflow-library-tabs';
import { useWorkflowTemplateItems } from './useWorkflowTemplateItems';
import { useWorkflowTemplatesPage } from './useWorkflowTemplatesPage';
import { WorkflowTemplateDetailsPanel } from './WorkflowTemplateDetailsPanel';
import {
  buildCatalogItems,
  buildFeaturedItems,
  buildShowcaseFeaturedItems,
  buildTypeTiles,
  CATALOG_SOURCES,
  cadenceLabel,
  categoryLabel,
  filterCatalogItems,
  isCatalogSource,
} from './workflow-template-catalog';
import { CATALOG_DATA_SOURCES } from './workflow-template-state';

const MIN_TYPE_TILES = 2;

function WorkflowTemplatesPageContent() {
  const translate = useTranslations('pages.workflows.templates');
  const translateWorkflows = useTranslations('common.automation.workflows');
  const page = useWorkflowTemplatesPage();
  const {
    state,
    dispatch,
    href,
    detailsItem,
    setDetailsItem,
    view,
    setView,
    loadSources,
    templateId,
    retryBootstrap,
  } = page;
  const {
    templates,
    systemCatalog,
    featured,
    sourceStatus,
    hasSettled,
    selectedCategory,
    selectedSource,
    searchQuery,
    actionError,
    isBootstrapping,
    installingCanonicalId,
    copyingFeaturedWorkflowId,
  } = state;
  const {
    sourceLabel,
    renderTemplateCard,
    renderTemplateRow,
    detailsInstallAction,
  } = useWorkflowTemplateItems({
    copyingFeaturedWorkflowId,
    installingCanonicalId,
    copyFeaturedWorkflow: page.copyFeaturedWorkflow,
    installSystemEntry: page.installSystemEntry,
    setDetailsItem,
  });
  const isAnySourceLoading = CATALOG_DATA_SOURCES.some(
    (source) => sourceStatus[source] === 'loading',
  );
  const catalogItems = useMemo(
    () =>
      buildCatalogItems({
        href,
        systemCatalog,
        templates,
      }),
    [href, systemCatalog, templates],
  );

  const visibleItems = useMemo(
    () =>
      filterCatalogItems(catalogItems, {
        category: selectedCategory,
        searchQuery,
        source: selectedSource,
      }),
    [catalogItems, searchQuery, selectedCategory, selectedSource],
  );

  const featuredItems = useMemo(() => {
    if (featured.length > 0) {
      return buildFeaturedItems(featured, translate('untitledWorkflow'));
    }
    // A failed pin read keeps its own error. Showcase fills the row only
    // after that read succeeds and returns nothing.
    if (sourceStatus.featured !== 'ready') {
      return [];
    }
    return buildShowcaseFeaturedItems(templates, href);
  }, [featured, href, sourceStatus.featured, templates, translate]);

  const typeTiles = useMemo(
    () => buildTypeTiles(catalogItems, translate),
    [catalogItems, translate],
  );

  const failedSources = CATALOG_DATA_SOURCES.filter(
    (source) => sourceStatus[source] === 'error',
  );
  const isFeaturedLoading =
    isBootstrapping || sourceStatus.featured === 'loading';
  // A retry keeps whatever already loaded on screen; only an empty All
  // falls back to skeletons while a request is in flight.
  const isAllLoading =
    isBootstrapping ||
    !hasSettled ||
    (catalogItems.length === 0 && isAnySourceLoading);
  const hasLoadFailure = failedSources.length > 0;

  function loadErrorMessage(sources: readonly DataSource[]): string {
    if (sources.length > 1) {
      return translate('errors.load');
    }
    switch (sources[0]) {
      case 'featured':
        return translate('errors.loadFeatured');
      case 'templates':
        return translate('errors.loadTemplates');
      default:
        return translate('errors.loadCatalog');
    }
  }

  function renderLoadError(sources: readonly DataSource[]) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{loadErrorMessage(sources)}</span>
        <Button
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          onClick={() => void loadSources(sources)}
        >
          {translate('retry')}
        </Button>
      </div>
    );
  }

  const filterChips = [
    ...(selectedCategory !== 'all'
      ? [
          {
            id: 'category',
            label: categoryLabel(selectedCategory, translate),
            onRemove: () => dispatch({ type: 'SET_CATEGORY', category: 'all' }),
          },
        ]
      : []),
    ...(selectedSource !== 'all'
      ? [
          {
            id: 'source',
            label: sourceLabel(selectedSource),
            onRemove: () => dispatch({ type: 'SET_SOURCE', source: 'all' }),
          },
        ]
      : []),
  ];

  const categoryOptions = [
    { id: 'all', label: categoryLabel('all', translate) },
    ...typeTiles.map((tile) => ({ id: tile.id, label: tile.label })),
  ];

  const catalogChrome = {
    headerTabs: workflowCollectionHeaderTabs(href),
    label: translateWorkflows('library.title'),
    titleVisibility: 'sr-only' as const,
  };

  const isCatalogEmpty =
    hasSettled &&
    !isAnySourceLoading &&
    !isBootstrapping &&
    !hasLoadFailure &&
    catalogItems.length === 0;

  return (
    <Container {...catalogChrome}>
      {!isBootstrapping && actionError ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive" role="alert">
            {actionError.detail ?? translate(`errors.${actionError.key}`)}
          </p>
          {actionError.key === 'bootstrap' && templateId ? (
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={retryBootstrap}
            >
              {translate('actions.tryAgain')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-8" data-testid="templates-content">
        <CollectionCarouselSection
          gap="md"
          title={translate('sections.featured')}
          itemCount={isFeaturedLoading ? 0 : featuredItems.length}
          error={
            // Held while a template bootstraps; the page is about to leave.
            !isBootstrapping && sourceStatus.featured === 'error'
              ? renderLoadError(['featured'])
              : undefined
          }
          data-testid="templates-featured-section"
        >
          {featuredItems.map((item) => (
            <div key={item.id} className="w-[min(26rem,85%)] shrink-0">
              {renderTemplateCard(item)}
            </div>
          ))}
        </CollectionCarouselSection>

        <CollectionSection
          title={translate('sections.browseByType')}
          itemCount={
            isBootstrapping ||
            isAnySourceLoading ||
            typeTiles.length < MIN_TYPE_TILES
              ? 0
              : typeTiles.length
          }
          data-testid="templates-browse-section"
        >
          <CollectionGrid density="tile" maxColumns={4}>
            {typeTiles.map((tile) => {
              const isSelected = tile.id === selectedCategory;
              return (
                <Card
                  key={tile.id}
                  className={cn(isSelected && 'shadow-border-strong')}
                  bodyClassName="gap-1"
                  isPressed={isSelected}
                  label={tile.label}
                  onClick={() =>
                    dispatch({ type: 'SET_CATEGORY', category: tile.id })
                  }
                  data-testid="workflow-template-type-tile"
                >
                  <span className="text-xs text-muted-foreground">
                    {translate('templateCount', { count: tile.count })}
                  </span>
                </Card>
              );
            })}
          </CollectionGrid>
        </CollectionSection>

        <CollectionSection
          title={translate('sections.all')}
          itemCount={catalogItems.length}
          isLoading={isAllLoading}
          error={
            !isAllLoading && hasLoadFailure && catalogItems.length === 0
              ? renderLoadError(failedSources)
              : undefined
          }
          data-testid="templates-all-section"
        >
          <CollectionToolbar
            search={
              <FormSearchbar
                className="w-64"
                onSearch={(value) =>
                  dispatch({ type: 'SET_SEARCH', searchQuery: value })
                }
                placeholder={translate('searchPlaceholder')}
                size={ComponentSize.SM}
                value={searchQuery}
              />
            }
            filters={
              <>
                <Select
                  value={selectedSource}
                  onValueChange={(value) => {
                    if (isCatalogSource(value)) {
                      dispatch({ type: 'SET_SOURCE', source: value });
                    }
                  }}
                >
                  <SelectTrigger
                    aria-label={translate('source')}
                    className="h-8 w-36"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATALOG_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {sourceLabel(source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedCategory}
                  onValueChange={(value) =>
                    dispatch({ type: 'SET_CATEGORY', category: value })
                  }
                >
                  <SelectTrigger
                    aria-label={translate('category')}
                    className="h-8 w-40"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            view={view}
            onViewChange={setView}
            chips={filterChips}
            onClearChips={() => dispatch({ type: 'CLEAR_FILTERS' })}
          />
          {hasLoadFailure && !isAllLoading ? (
            <div role="alert">
              <Card bodyClassName="px-4 py-3 text-sm text-muted-foreground">
                {renderLoadError(failedSources)}
              </Card>
            </div>
          ) : null}
          <CollectionView
            items={visibleItems}
            view={view}
            getItemKey={(item) => item.id}
            renderListItem={renderTemplateRow}
            renderGridItem={renderTemplateCard}
            maxColumns={3}
            isLoading={isAllLoading}
            emptyState={
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm text-foreground/50">
                  {translate('noMatches')}
                </p>
                <Button
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => dispatch({ type: 'CLEAR_FILTERS' })}
                >
                  {translate('clearFilters')}
                </Button>
              </div>
            }
            data-testid="templates-all-collection"
          />
        </CollectionSection>

        {isCatalogEmpty ? (
          <p className="py-16 text-center text-sm text-foreground/50">
            {translate('emptyCatalog')}
          </p>
        ) : null}
      </div>
      <WorkflowTemplateDetailsPanel
        actionLabel={translate('actions.useTemplate')}
        categoryLabel={
          detailsItem?.category
            ? categoryLabel(detailsItem.category, translate)
            : ''
        }
        changeSummary={detailsItem?.changeSummary}
        description={detailsItem?.description ?? ''}
        href={detailsItem?.href}
        isInstalling={
          detailsItem?.featuredWorkflowId
            ? detailsItem.featuredWorkflowId === copyingFeaturedWorkflowId
            : detailsItem?.systemEntry?.canonicalId === installingCanonicalId
        }
        id={detailsItem?.id ?? null}
        onClose={() => setDetailsItem(null)}
        onInstall={detailsInstallAction(detailsItem)}
        preview={
          detailsItem
            ? {
                edges: detailsItem.edges,
                exampleOutput: detailsItem.exampleOutput,
                name: detailsItem.title,
                nodes: detailsItem.nodes,
              }
            : undefined
        }
        scheduleLabel={
          detailsItem ? cadenceLabel(detailsItem.schedule, translate) : null
        }
        sourceLabel={detailsItem ? sourceLabel(detailsItem.source) : ''}
        title={detailsItem?.title ?? ''}
      />
    </Container>
  );
}

export default function WorkflowTemplatesPage() {
  return (
    <Suspense fallback={null}>
      <WorkflowTemplatesPageContent />
    </Suspense>
  );
}
