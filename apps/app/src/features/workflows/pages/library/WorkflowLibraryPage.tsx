'use client';

import { isDesktopClient } from '@genfeedai/config/deployment';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import {
  CalendarClock,
  Cloud,
  CloudUpload,
  Pause,
  Plus,
  Search,
} from 'lucide-react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { describeCadence } from '@/features/workflows/components/schedule/schedule-cadence';
import { WorkflowScheduleDialog } from '@/features/workflows/components/schedule/WorkflowScheduleDialog';
import { isCanonicalSystemWorkflow } from '@/features/workflows/services/workflow-api';
import {
  formatLifecycleLabel,
  getLifecycleBadgeClass,
  isNonDefaultWorkflowLifecycle,
} from '@/features/workflows/utils/status-helpers';
import EmptyWorkflowState from './EmptyWorkflowState';
import { useWorkflowLibraryPage } from './useWorkflowLibraryPage';
import WorkflowCardDropdown from './WorkflowCardDropdown';
import WorkflowCardPreview from './WorkflowCardPreview';

/**
 * Workflow Library - List of saved workflows with search, cards, and actions
 */
export default function WorkflowLibraryPage() {
  const translate = useTranslations('common.automation.workflows');
  const { push } = useRouter();
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
    filteredWorkflows,
    selectedIds,
    toggleSelected,
    clearSelection,
    pagination,
    setPage,
  } = useWorkflowLibraryPage();
  const isDesktopShell = isDesktopClient();
  const [schedulingWorkflowId, setSchedulingWorkflowId] = useState<
    string | null
  >(null);

  const isInitialLoading = isLoading && (workflows ?? []).length === 0;

  const topbar = (
    <SectionTopbar
      title={translate('library.title')}
      titleVisibility="sr-only"
      tabs={
        <div className="flex w-full max-w-md items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
            <Input
              type="text"
              placeholder={translate('library.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-8 rounded-md border-border bg-card py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/40 focus-visible:border-border-strong focus-visible:ring-0"
            />
          </div>
          {isLoading && workflows.length > 0 ? (
            <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
          ) : null}
        </div>
      }
      actions={
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
      }
    />
  );

  if (error) {
    return (
      <div className="flex min-h-0 flex-col">
        {topbar}
        <Container>
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 px-6 text-center">
            <p className="text-destructive">{error}</p>
            <Button
              label={translate('actions.retry')}
              variant={ButtonVariant.SECONDARY}
              onClick={() => {
                const controller = new AbortController();
                loadWorkflows(controller.signal);
              }}
            />
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      {topbar}
      <Container>
        {selectedIds.size > 0 ? (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2">
            <span className="text-sm text-foreground">
              {translate('library.selectedCount', { count: selectedIds.size })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant={ButtonVariant.SECONDARY}
                onClick={() => {
                  void handleDisableSelected();
                }}
              >
                <Pause className="size-4" />
                {translate('library.disableSelected')}
              </Button>
              <Button
                variant={ButtonVariant.UNSTYLED}
                onClick={clearSelection}
                className="text-sm text-foreground/70 hover:text-foreground"
              >
                {translate('library.clearSelection')}
              </Button>
            </div>
          </div>
        ) : null}

        {isInitialLoading ? (
          <div
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            data-testid="library-skeleton"
          >
            {['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'].map(
              (skeletonId) => (
                <div
                  key={skeletonId}
                  className="h-64 animate-pulse rounded-card bg-card shadow-border"
                />
              ),
            )}
          </div>
        ) : filteredWorkflows.length === 0 && !searchInput ? (
          <EmptyWorkflowState />
        ) : filteredWorkflows.length === 0 && searchInput ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-foreground/50">
              {translate('library.noMatching', { search: searchInput })}
            </p>
          </div>
        ) : (
          <div
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            data-testid="library-content"
          >
            {/* New Workflow card */}
            <Button
              asChild
              className="group flex items-center justify-center rounded-card border-2 border-dashed border-border bg-card/40 p-4 transition-[border-color,background-color] duration-200 hover:border-border-strong hover:bg-card/60"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              <Link href={href(APP_ROUTES.AUTOMATION.WORKFLOWS_NEW)}>
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="flex size-14 items-center justify-center rounded-full bg-foreground/5 transition-[transform,background-color] duration-300 group-hover:scale-110 group-hover:bg-foreground/10">
                    <Plus className="size-7 text-foreground/50" />
                  </div>
                  <span className="text-sm font-medium text-foreground/70">
                    {translate('library.newWorkflow')}
                  </span>
                </div>
              </Link>
            </Button>

            {/* Workflow cards */}
            {filteredWorkflows.map((workflow) => {
              const isSystemWorkflow = isCanonicalSystemWorkflow(workflow);

              return (
                <Card
                  key={workflow.id}
                  className="group h-full hover:-translate-y-0.5"
                  label={workflow.label}
                  description={
                    workflow.description ??
                    'Reusable automation workflow for content operations.'
                  }
                  headerAction={
                    <div className="relative z-20 flex shrink-0 items-center gap-2">
                      <Checkbox
                        aria-label={translate('library.selectWorkflow', {
                          name: workflow.label,
                        })}
                        checked={selectedIds.has(workflow.id)}
                        onCheckedChange={() => toggleSelected(workflow.id)}
                      />
                      {isSystemWorkflow ? (
                        <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs text-info">
                          {translate('library.system')}
                        </span>
                      ) : null}
                      {isDesktopShell &&
                      isCapable &&
                      isConnected &&
                      workflow.cloudSync ? (
                        <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                          <Cloud className="size-3" />
                          {translate('library.synced')}
                        </span>
                      ) : isDesktopShell && isCapable && isConnected ? (
                        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <CloudUpload className="size-3" />
                          {translate('library.local')}
                        </span>
                      ) : null}
                      {isNonDefaultWorkflowLifecycle(workflow.lifecycle) ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${getLifecycleBadgeClass(
                            workflow.lifecycle,
                          )}`}
                        >
                          {formatLifecycleLabel(workflow.lifecycle)}
                        </span>
                      ) : null}
                      <WorkflowCardDropdown
                        canDelete={!isSystemWorkflow}
                        onDuplicate={() => handleDuplicate(workflow.id)}
                        onDelete={() => handleDelete(workflow.id)}
                        onOpen={() =>
                          push(
                            href(
                              `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.id}`,
                            ),
                          )
                        }
                        onDisableSchedule={
                          workflow.schedule && workflow.isScheduleEnabled
                            ? () => handleToggleSchedule(workflow.id, false)
                            : undefined
                        }
                        onSchedule={() => setSchedulingWorkflowId(workflow.id)}
                      />
                    </div>
                  }
                  bodyClassName="h-full justify-between"
                >
                  <Link
                    href={href(
                      `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.id}`,
                    )}
                    aria-label={`Open ${workflow.label}`}
                    className="absolute inset-0 z-10 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  />
                  <div className="space-y-3">
                    <WorkflowCardPreview
                      name={workflow.label}
                      thumbnail={workflow.thumbnail}
                    />
                    {workflow.schedule ? (
                      <div className="relative z-20 flex items-center gap-2 text-xs text-foreground/60">
                        <CalendarClock className="size-3.5 shrink-0" />
                        <span className="min-w-0 truncate">
                          {describeCadence(workflow.schedule)}
                          {workflow.isScheduleEnabled && workflow.nextRunAt ? (
                            <>
                              {` · ${translate('library.nextRun')} `}
                              <ClientFormattedDate
                                format="relative"
                                value={workflow.nextRunAt}
                              />
                            </>
                          ) : workflow.isScheduleEnabled ? null : (
                            ` · ${translate('library.paused')}`
                          )}
                        </span>
                        <Switch
                          checked={workflow.isScheduleEnabled ?? false}
                          aria-label={`${workflow.isScheduleEnabled ? 'Disable' : 'Enable'} schedule for ${workflow.label}`}
                          onCheckedChange={(checked) =>
                            handleToggleSchedule(workflow.id, checked)
                          }
                        />
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between text-xs text-foreground/50">
                      <span>
                        {translate('library.updated')}{' '}
                        <ClientFormattedDate
                          format="relative"
                          value={workflow.updatedAt}
                        />
                      </span>
                      <span>
                        {translate('library.created')}{' '}
                        <ClientFormattedDate
                          format="date"
                          value={workflow.createdAt}
                        />
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {pagination.pages > 1 ? (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant={ButtonVariant.SECONDARY}
              disabled={pagination.page <= 1}
              onClick={() => setPage(Math.max(1, pagination.page - 1))}
            >
              {translate('library.previous')}
            </Button>
            <span className="text-sm text-muted-foreground">
              {translate('library.pageStatus', {
                page: pagination.page,
                pages: pagination.pages,
              })}
            </span>
            <Button
              variant={ButtonVariant.SECONDARY}
              disabled={pagination.page >= pagination.pages}
              onClick={() =>
                setPage(Math.min(pagination.pages, pagination.page + 1))
              }
            >
              {translate('library.next')}
            </Button>
          </div>
        ) : null}

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
    </div>
  );
}
