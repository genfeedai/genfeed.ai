'use client';

import { ButtonSize, ButtonVariant, ViewType } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionView from '@ui/collection/CollectionView';
import CollectionViewToggle from '@ui/collection/CollectionViewToggle';
import Container from '@ui/layout/container/Container';
import SelectionToolbar from '@ui/lists/selection-toolbar/SelectionToolbar';
import PaginationStepper from '@ui/navigation/pagination/PaginationStepper';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import {
  CalendarClock,
  Copy,
  Pause,
  Plus,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import SearchField from '@/components/content/search-field/SearchField';
import { WorkflowScheduleDialog } from '@/features/workflows/components/schedule/WorkflowScheduleDialog';
import {
  isCanonicalSystemWorkflow,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { useIsDesktopClient } from '@/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import { useCollectionViewPreference } from '@/hooks/utils/use-collection-view-preference/use-collection-view-preference';
import { workflowCollectionHeaderTabs } from '../workflow-library-tabs';
import EmptyWorkflowState from './EmptyWorkflowState';
import { useWorkflowLibraryHighlights } from './useWorkflowLibraryHighlights';
import { useWorkflowLibraryPage } from './useWorkflowLibraryPage';
import WorkflowLibraryCard from './WorkflowLibraryCard';
import WorkflowLibraryRow from './WorkflowLibraryRow';
import {
  isRecentSectionVisible,
  selectRecentWorkflows,
  WORKFLOW_LIBRARY_SURFACE,
} from './workflow-library-sections';

/**
 * Workflow Library — Favorites, team usage, Recent above All (list default, grid
 * toggle). There is no Needs you section: the list payload carries no
 * last-run outcome for scheduled workflows (scheduled failures keep the
 * workflow `active`), so the page cannot tell which ones failed.
 */
export default function WorkflowLibraryPage() {
  const translate = useTranslations('common.automation.workflows');
  const highlights = useWorkflowLibraryHighlights();
  const {
    href,
    isConnected,
    isCapable,
    workflows,
    isLoading,
    error,
    searchInput,
    setSearchInput,
    loadWorkflows,
    handleDuplicate,
    handleDelete,
    handleToggleSchedule,
    handleDisableSelected,
    applyScheduleUpdate,
    selectedIds,
    toggleSelected,
    clearSelection,
    pagination,
    setPage,
  } = useWorkflowLibraryPage({
    relatedWorkflows: [
      ...highlights.favorites.items,
      ...highlights.mostUsed.items,
    ],
    onWorkflowUpdated: highlights.updateWorkflow,
    onWorkflowRemoved: highlights.removeWorkflow,
  });
  const isDesktopShell = useIsDesktopClient();
  const { view, setView } = useCollectionViewPreference({
    defaultView: ViewType.LIST,
    surface: WORKFLOW_LIBRARY_SURFACE,
  });
  const [schedulingWorkflowId, setSchedulingWorkflowId] = useState<
    string | null
  >(null);

  const isInitialLoading = isLoading && workflows.length === 0;
  const isEmpty =
    !isLoading &&
    !error &&
    workflows.length === 0 &&
    !searchInput &&
    !highlights.favorites.isLoading &&
    !highlights.mostUsed.isLoading &&
    !highlights.favorites.hasError &&
    !highlights.mostUsed.hasError &&
    highlights.favorites.items.length === 0 &&
    highlights.mostUsed.items.length === 0;
  const isCloudStateVisible = isDesktopShell && isCapable && isConnected;
  const recentWorkflows =
    !error &&
    isRecentSectionVisible({
      page: pagination.page,
      searchInput,
      workflowCount: workflows.length,
    })
      ? selectRecentWorkflows(
          workflows.filter(
            (workflow) => !highlights.favoriteIds.includes(workflow.id),
          ),
        )
      : [];

  function getWorkflowHref(workflowId: string): string {
    return href(`${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflowId}`);
  }

  function getOverflowActions(
    workflow: WorkflowSummary,
    isSystemWorkflow: boolean,
  ): CollectionOverflowAction[] {
    const actions: CollectionOverflowAction[] = [
      {
        icon: highlights.favoriteIds.includes(workflow.id) ? (
          <StarOff className="size-4" />
        ) : (
          <Star className="size-4" />
        ),
        id: 'favorite',
        label: translate(
          highlights.favoriteIds.includes(workflow.id)
            ? 'library.removeFavorite'
            : 'library.addFavorite',
        ),
        isDisabled:
          highlights.isSavingFavorite ||
          highlights.favorites.isLoading ||
          highlights.favorites.hasError,
        onSelect: () => {
          void highlights.toggleFavorite(workflow);
        },
      },
      {
        icon: <CalendarClock className="size-4" />,
        id: 'schedule',
        label: translate('actions.schedule'),
        onSelect: () => setSchedulingWorkflowId(workflow.id),
      },
    ];

    if (workflow.schedule && workflow.isScheduleEnabled) {
      actions.push({
        icon: <Pause className="size-4" />,
        id: 'disable-schedule',
        label: translate('actions.disableSchedule'),
        onSelect: () => {
          void handleToggleSchedule(workflow.id, false);
        },
      });
    }

    actions.push({
      icon: <Copy className="size-4" />,
      id: 'duplicate',
      label: translate('actions.duplicate'),
      onSelect: () => {
        void handleDuplicate(workflow.id);
      },
    });

    if (!isSystemWorkflow) {
      actions.push({
        icon: <Trash2 className="size-4" />,
        id: 'delete',
        isDestructive: true,
        label: translate('actions.delete'),
        onSelect: () => {
          void handleDelete(workflow.id);
        },
      });
    }

    return actions;
  }

  function getItemProps(workflow: WorkflowSummary, isReadOnly = false) {
    const isSystemWorkflow = isCanonicalSystemWorkflow(workflow);

    return {
      isCloudStateVisible,
      isReadOnly,
      isSelected: selectedIds.has(workflow.id),
      isSystemWorkflow,
      onToggleSchedule: (isEnabled: boolean) => {
        void handleToggleSchedule(workflow.id, isEnabled);
      },
      onToggleSelected: () => toggleSelected(workflow.id),
      openHref: getWorkflowHref(workflow.id),
      overflowActions: getOverflowActions(workflow, isSystemWorkflow).filter(
        (action) =>
          !isReadOnly ||
          (action.id === 'favorite' &&
            highlights.favoriteIds.includes(workflow.id)),
      ),
      workflow,
    };
  }

  const libraryChrome = {
    headerTabs: workflowCollectionHeaderTabs(href),
    label: translate('library.title'),
    leading: (
      <SearchField
        onSearch={setSearchInput}
        placeholder={translate('library.searchPlaceholder')}
        value={searchInput}
      />
    ),
    right: (
      <div className="flex items-center gap-2">
        {isLoading && workflows.length > 0 ? (
          <Spinner className="size-4 shrink-0 text-foreground/60" />
        ) : null}
        {isEmpty ? null : (
          <CollectionViewToggle onViewChange={setView} view={view} />
        )}
        {isEmpty ? null : (
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            <Link href={href(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW)}>
              <Plus className="size-4" />
              {translate('library.newWorkflow')}
            </Link>
          </Button>
        )}
      </div>
    ),
    titleVisibility: 'sr-only' as const,
  };

  const errorState = error ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-destructive">{error}</span>
      <Button
        label={translate('actions.retry')}
        onClick={() => {
          const controller = new AbortController();
          loadWorkflows(controller.signal);
        }}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
      />
    </div>
  ) : null;

  if (isEmpty) {
    return (
      <Container {...libraryChrome}>
        <EmptyWorkflowState />
      </Container>
    );
  }

  return (
    <Container {...libraryChrome}>
      <div className="flex flex-col gap-8">
        <SelectionToolbar
          count={selectedIds.size}
          label={translate('library.selectedCount', {
            count: selectedIds.size,
          })}
          clearLabel={translate('library.clearSelection')}
          onClear={clearSelection}
        >
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={() => {
              void handleDisableSelected();
            }}
          >
            <Pause className="size-4" />
            {translate('library.disableSelected')}
          </Button>
        </SelectionToolbar>

        {[
          {
            id: 'favorites',
            title: translate('library.sectionFavorites'),
            state: highlights.favorites,
          },
          {
            id: 'most-used',
            title: translate('library.sectionMostUsed'),
            state: highlights.mostUsed,
          },
        ].map(({ id, title, state }) => (
          <CollectionSection
            key={id}
            data-testid={`workflow-section-${id}`}
            title={title}
            itemCount={state.items.length}
            isLoading={state.isLoading}
            error={
              state.hasError ? (
                <div className="flex items-center justify-between gap-3">
                  <span>{translate('library.sectionError')}</span>
                  <Button
                    label={translate('actions.retry')}
                    onClick={highlights.reload}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  />
                </div>
              ) : undefined
            }
          >
            <CollectionView
              items={state.items}
              getItemKey={(workflow) => workflow.id}
              isLoading={state.isLoading}
              skeletonCount={3}
              view={ViewType.LIST}
              renderListItem={(workflow) => (
                <WorkflowLibraryRow
                  {...getItemProps(workflow, id === 'most-used')}
                  executionCount={
                    id === 'most-used' && 'executionCount' in workflow
                      ? Number(workflow.executionCount)
                      : undefined
                  }
                />
              )}
              renderGridItem={(workflow) => (
                <WorkflowLibraryCard
                  {...getItemProps(workflow, id === 'most-used')}
                />
              )}
            />
          </CollectionSection>
        ))}

        <CollectionSection
          data-testid="workflow-section-recent"
          itemCount={recentWorkflows.length}
          title={translate('library.sectionRecent')}
        >
          <CollectionList>
            {recentWorkflows.map((workflow) => (
              <WorkflowLibraryRow
                key={workflow.id}
                {...getItemProps(workflow)}
              />
            ))}
          </CollectionList>
        </CollectionSection>

        <CollectionSection
          data-testid="workflow-section-all"
          error={errorState}
          isLoading={isInitialLoading}
          itemCount={workflows.length}
          title={translate('library.sectionAll')}
        >
          <CollectionView
            data-testid={
              isInitialLoading ? 'library-skeleton' : 'library-content'
            }
            getItemKey={(workflow) => workflow.id}
            isLoading={isInitialLoading}
            items={workflows}
            renderGridItem={(workflow) => (
              <WorkflowLibraryCard {...getItemProps(workflow)} />
            )}
            renderListItem={(workflow) => (
              <WorkflowLibraryRow {...getItemProps(workflow)} />
            )}
            view={view}
          />
        </CollectionSection>

        {!isLoading && !error && workflows.length === 0 && searchInput ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-foreground/50">
              {translate('library.noMatching', { search: searchInput })}
            </p>
          </div>
        ) : null}

        {pagination.pages > 1 ? (
          <PaginationStepper
            hasNext={pagination.page < pagination.pages}
            hasPrevious={pagination.page > 1}
            nextLabel={translate('library.next')}
            onNext={() =>
              setPage(Math.min(pagination.pages, pagination.page + 1))
            }
            onPrevious={() => setPage(Math.max(1, pagination.page - 1))}
            previousLabel={translate('library.previous')}
            status={translate('library.pageStatus', {
              page: pagination.page,
              pages: pagination.pages,
            })}
          />
        ) : null}
      </div>

      {schedulingWorkflowId ? (
        <WorkflowScheduleDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) {
              setSchedulingWorkflowId(null);
            }
          }}
          onSaved={applyScheduleUpdate}
          workflowId={schedulingWorkflowId}
        />
      ) : null}
    </Container>
  );
}
