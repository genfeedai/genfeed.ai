'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import {
  AlertCategory,
  ButtonVariant,
  ComponentSize,
  ViewType,
} from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useOptionalDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import {
  useOptionalResearchWorkSurface,
  useResearchQueryState,
  useResearchSearchParamState,
  useRestoreResearchFinding,
} from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import {
  type AuthorizedResearchFinding,
  toSourcePostFinding,
  toTrendContentFinding,
  toTrendVideoFinding,
} from '@pages/research/work-surface/research-work-surface.types';
import {
  DeskEmptyState,
  DiscoveryReadinessCards,
} from '@pages/trends/desk/desk-empty-states';
import DeskFilterRail from '@pages/trends/desk/desk-filter-rail';
import DeskHeatStrip from '@pages/trends/desk/desk-heat-strip';
import DeskLightTableView from '@pages/trends/desk/desk-light-table-view';
import DeskSelectionBar from '@pages/trends/desk/desk-selection-bar';
import {
  createInitialDeskState,
  type DiscoveryDeskContentTypeFilter,
  discoveryDeskReducer,
  selectVisibleItems,
} from '@pages/trends/desk/desk-state';
import DeskTableView from '@pages/trends/desk/desk-table-view';
import { useDeskKeyboard } from '@pages/trends/desk/use-desk-keyboard';
import { useDiscoveryDeskItems } from '@pages/trends/desk/use-discovery-desk-items';
import type {
  DiscoveryDeskItem,
  DiscoveryDeskSort,
  DiscoveryDeskSource,
} from '@props/trends/discovery-desk.props';
import type { ViewOption } from '@props/ui/navigation/view-toggle.props';
import { NotificationsService } from '@services/core/notifications.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import { LayoutGrid, TableProperties, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from 'react';

function buildFinding(item: DiscoveryDeskItem): AuthorizedResearchFinding {
  switch (item.raw.kind) {
    case 'trend':
      return toTrendContentFinding(item.raw.item);
    case 'source_post':
      return toSourcePostFinding(item.raw.post);
    case 'viral_video':
      return toTrendVideoFinding(item.raw.video);
    default:
      return item.raw satisfies never;
  }
}

const SOURCE_VALUES: readonly DiscoveryDeskSource[] = [
  'trends',
  'following',
  'owned',
];
const SORT_VALUES: readonly DiscoveryDeskSort[] = [
  'velocity',
  'virality',
  'recency',
  'engagement',
];
/**
 * Discovery "Signal Desk" — the composed replacement for the retired
 * `trends-list.tsx` (public trends) and `following-page.tsx` (creators the
 * brand follows). One item model (`DiscoveryDeskItem`), one filter rail, and
 * two shareable-URL views: the operator Desk table and the media-first
 * "Light table" grid.
 */
export default function DiscoveryDesk() {
  const translateDesk = useTranslations('trends.desk');
  const brandId = useBrandId();
  const { href, orgHref } = useOrgUrl();
  const surface = useOptionalResearchWorkSurface();
  const [search, setSearch] = useResearchQueryState();
  const [view, setView] = useResearchSearchParamState<
    ViewType.TABLE | ViewType.GRID
  >({
    allowedValues: [ViewType.TABLE, ViewType.GRID],
    defaultValue: ViewType.TABLE,
    key: 'view',
  });
  const [sourceParam, setSourceParam] = useResearchSearchParamState<
    DiscoveryDeskSource | 'all'
  >({
    allowedValues: [...SOURCE_VALUES, 'all'],
    defaultValue: 'all',
    key: 'source',
  });
  const [sortParam, setSortParam] =
    useResearchSearchParamState<DiscoveryDeskSort>({
      allowedValues: SORT_VALUES,
      defaultValue: 'velocity',
      key: 'sort',
    });
  const [platformParam, setPlatformParam] = useResearchSearchParamState<string>(
    {
      defaultValue: '',
      key: 'platform',
      maxLength: 400,
    },
  );

  const [state, dispatch] = useReducer(
    discoveryDeskReducer,
    undefined,
    createInitialDeskState,
  );

  // URL params are the source of truth for filters/sort/view; reconcile the
  // reducer state on every param change (back/forward nav, shared links,
  // sidebar `?source=following`).
  useEffect(() => {
    if (state.filters.source !== sourceParam) {
      dispatch({ source: sourceParam, type: 'SET_SOURCE' });
    }
  }, [sourceParam, state.filters.source]);

  useEffect(() => {
    if (state.sort !== sortParam) {
      dispatch({ sort: sortParam, type: 'SET_SORT' });
    }
  }, [sortParam, state.sort]);

  useEffect(() => {
    const nextPlatforms = new Set(
      platformParam ? platformParam.split(',').filter(Boolean) : [],
    );
    const current = state.filters.platforms;
    const isSame =
      current.size === nextPlatforms.size &&
      Array.from(current).every((platform) => nextPlatforms.has(platform));
    if (!isSame) {
      dispatch({ platforms: nextPlatforms, type: 'SET_PLATFORMS' });
    }
  }, [platformParam, state.filters.platforms]);

  const { error, isLoading, isRefreshing, items, refresh, sources, summary } =
    useDiscoveryDeskItems();

  const visibleItems = useMemo(
    () => selectVisibleItems(items, state),
    [items, state],
  );

  const filteredBySearch = useMemo(() => {
    if (!search.trim()) {
      return visibleItems;
    }

    const query = search.toLowerCase();
    return visibleItems.filter((item) =>
      [
        item.authorHandle,
        item.platform,
        item.text,
        item.title,
        item.trendTopic,
        ...item.matchedTrends,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [search, visibleItems]);

  const findings = useMemo(
    () => filteredBySearch.map(buildFinding),
    [filteredBySearch],
  );
  const currentError = error;
  useRestoreResearchFinding(findings, isLoading || Boolean(currentError));

  const visibleKeys = useMemo(
    () => filteredBySearch.map((item) => item.key),
    [filteredBySearch],
  );

  const handleTogglePlatform = useCallback(
    (platform: string) => {
      const next = new Set(state.filters.platforms);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      dispatch({ platforms: next, type: 'SET_PLATFORMS' });
      setPlatformParam(Array.from(next).join(','));
    },
    [setPlatformParam, state.filters.platforms],
  );

  const handleSourceChange = useCallback(
    (value: DiscoveryDeskSource | 'all') => {
      dispatch({ source: value, type: 'SET_SOURCE' });
      setSourceParam(value);
    },
    [setSourceParam],
  );

  const handleContentTypeChange = useCallback(
    (value: DiscoveryDeskContentTypeFilter) => {
      dispatch({ contentType: value, type: 'SET_CONTENT_TYPE' });
    },
    [],
  );

  const handleSort = useCallback(
    (value: DiscoveryDeskSort) => {
      dispatch({ sort: value, type: 'SET_SORT' });
      setSortParam(value);
    },
    [setSortParam],
  );

  const handleCursor = useCallback((key: string) => {
    dispatch({ key, type: 'SET_CURSOR' });
  }, []);

  const handleToggleSelect = useCallback((key: string) => {
    dispatch({ key, type: 'TOGGLE_SELECT' });
  }, []);

  const handleClearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' });
  }, []);

  const handleSelectFinding = useCallback(
    (item: DiscoveryDeskItem) => {
      surface?.selectFinding(buildFinding(item));
    },
    [surface],
  );

  const remix = useOptionalDiscoveryRemix();

  const handleRemixFocused = useCallback(
    (item: DiscoveryDeskItem) => {
      if (!item.remixSelector) {
        NotificationsService.getInstance().error(
          translateDesk('errors.remixUnavailable'),
        );
        return;
      }

      if (!remix) {
        return;
      }

      remix.openRemix(item.remixSelector).catch(() => {
        /* surfaced via provider status */
      });
    },
    [remix, translateDesk],
  );

  useDeskKeyboard({
    cursorKey: state.cursorKey,
    onClearSelection: handleClearSelection,
    onMoveCursor: (direction) => {
      dispatch({ direction, type: 'MOVE_CURSOR', visibleKeys });
    },
    onRemix: handleRemixFocused,
    onToggleSelect: handleToggleSelect,
    selectedItem:
      filteredBySearch.find((item) => item.key === state.cursorKey) ?? null,
  });

  const followingHref = href(
    `${APP_ROUTES.DISCOVERY.OVERVIEW}?source=following`,
  );
  const publishingHref = orgHref(APP_ROUTES.SETTINGS.PUBLISHING);

  const handleRefresh = useCallback(() => {
    refresh().catch(() => {
      /* surfaced via hook */
    });
  }, [refresh]);

  const selectedItems = useMemo(
    () => filteredBySearch.filter((item) => state.selection.has(item.key)),
    [filteredBySearch, state.selection],
  );

  const viewOptions = useMemo<ViewOption<ViewType.TABLE | ViewType.GRID>[]>(
    () => [
      {
        ariaLabel: translateDesk('viewToggle.desk'),
        icon: <TableProperties className="size-4" />,
        label: translateDesk('viewToggle.desk'),
        type: ViewType.TABLE,
      },
      {
        ariaLabel: translateDesk('viewToggle.lightTable'),
        icon: <LayoutGrid className="size-4" />,
        label: translateDesk('viewToggle.lightTable'),
        type: ViewType.GRID,
      },
    ],
    [translateDesk],
  );

  return (
    <>
      <SectionTopbar
        title={translateDesk('title')}
        subtitle={translateDesk('subtitle')}
        icon={TrendingUp}
        actions={
          <>
            <div className="w-44 sm:w-56">
              <FormSearchbar
                className="w-full"
                inputClassName="h-8"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSearch(event.target.value)
                }
                onClear={() => setSearch('')}
                placeholder={translateDesk('searchPlaceholder')}
                size={ComponentSize.SM}
                value={search}
              />
            </div>
            <Badge variant="ghost">
              {isLoading
                ? translateDesk('signalsLoading')
                : translateDesk('signalsCount', {
                    count: filteredBySearch.length,
                  })}
            </Badge>
            <ViewToggle
              activeView={view}
              onChange={setView}
              options={viewOptions}
              size={ComponentSize.SM}
            />
            <ButtonRefresh
              isRefreshing={isRefreshing}
              onClick={handleRefresh}
            />
          </>
        }
      />

      <Container>
        {currentError && !isLoading ? (
          <Alert type={AlertCategory.ERROR}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-medium">
                  {translateDesk('errors.loadTitle')}
                </div>
                <div className="text-xs text-foreground/70">
                  {translateDesk('errors.loadDescription')}
                </div>
              </div>
              <Button
                label={translateDesk('errors.retry')}
                onClick={handleRefresh}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          </Alert>
        ) : null}

        {!isLoading && !currentError && items.length === 0 ? (
          <DiscoveryReadinessCards summary={summary} />
        ) : null}

        {!isLoading && !currentError && items.length > 0 ? (
          <div className="mb-4">
            <DeskHeatStrip
              activePlatforms={state.filters.platforms}
              items={items}
              onTogglePlatform={handleTogglePlatform}
              publishingHref={publishingHref}
              summary={summary}
            />
          </div>
        ) : null}

        {!isLoading && !currentError && items.length > 0 ? (
          <div className="mb-4">
            <DeskFilterRail
              brandId={brandId}
              contentType={state.filters.contentType}
              onContentTypeChange={handleContentTypeChange}
              onSort={handleSort}
              onSourceChange={handleSourceChange}
              onSourcesChanged={refresh}
              sort={state.sort}
              source={state.filters.source}
              sources={sources}
            />
          </div>
        ) : null}

        {isLoading ? (
          <div className="py-8 text-sm text-foreground/40">
            {translateDesk('loading')}
          </div>
        ) : null}

        {!isLoading && !currentError && items.length > 0 ? (
          filteredBySearch.length === 0 ? (
            <DeskEmptyState
              followingHref={followingHref}
              hasSearch={Boolean(search.trim())}
              isRefreshing={isRefreshing}
              onClearSearch={() => setSearch('')}
              onRefresh={handleRefresh}
              publishingHref={publishingHref}
            />
          ) : view === ViewType.GRID ? (
            <DeskLightTableView
              cursorKey={state.cursorKey}
              href={href}
              items={filteredBySearch}
              onCursor={handleCursor}
              onSelectFinding={
                surface?.isEmbedded ? handleSelectFinding : undefined
              }
              onToggleSelect={handleToggleSelect}
              selection={state.selection}
            />
          ) : (
            <DeskTableView
              cursorKey={state.cursorKey}
              href={href}
              items={filteredBySearch}
              onCursor={handleCursor}
              onSelectFinding={
                surface?.isEmbedded ? handleSelectFinding : undefined
              }
              onToggleSelect={handleToggleSelect}
              selection={state.selection}
            />
          )
        ) : null}
      </Container>

      <DeskSelectionBar items={selectedItems} onClear={handleClearSelection} />
    </>
  );
}
