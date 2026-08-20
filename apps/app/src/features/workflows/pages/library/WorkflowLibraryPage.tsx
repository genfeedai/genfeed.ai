'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import {
  CalendarClock,
  Cloud,
  CloudUpload,
  Copy,
  Plus,
  Search,
  Zap,
} from 'lucide-react';

import Link from 'next/link';
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
    applyScheduleUpdate,
    filteredWorkflows,
  } = useWorkflowLibraryPage();
  const [schedulingWorkflowId, setSchedulingWorkflowId] = useState<
    string | null
  >(null);

  // Loading skeleton
  if (isLoading && (workflows ?? []).length === 0) {
    return (
      <Container
        label={translate('library.title')}
        description={translate('library.description')}
        icon={Zap}
        right={
          <>
            <div className="h-10 w-28 animate-pulse rounded bg-muted" />
            <div className="h-10 w-36 animate-pulse rounded bg-muted" />
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'].map(
            (skeletonId) => (
              <div
                key={skeletonId}
                className="h-64 animate-pulse rounded-lg border border-border bg-card"
              />
            ),
          )}
        </div>
      </Container>
    );
  }

  // Error state
  if (error) {
    return (
      <Container
        label={translate('library.title')}
        description={translate('library.description')}
        icon={Zap}
      >
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
    );
  }

  return (
    <Container
      label={translate('library.title')}
      description={translate('library.description')}
      icon={Zap}
      right={
        <>
          <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
            <Link href={href(APP_ROUTES.AUTOMATE.WORKFLOWS_TEMPLATES)}>
              <Copy className="size-4" />
              {translate('library.templates')}
            </Link>
          </Button>
          <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
            <Link href={href(APP_ROUTES.AUTOMATE.WORKFLOWS_NEW)}>
              <Plus className="size-4" />
              {translate('library.newWorkflow')}
            </Link>
          </Button>
        </>
      }
    >
      {/* Search bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
          <Input
            type="text"
            placeholder={translate('library.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-10 rounded-lg border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/40 focus-visible:border-border-strong focus-visible:ring-0"
          />
        </div>
        {isLoading && workflows.length > 0 && (
          <div className="size-4 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
        )}
      </div>

      {/* Contextual info */}
      <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground/70">
        <span className="font-medium text-foreground">
          {translate('library.title')}
        </span>{' '}
        {translate('library.info')}{' '}
        <Link
          href={href(APP_ROUTES.AUTOMATE.AUTOPILOT)}
          className="underline underline-offset-2"
        >
          {translate('library.autopilot')}
        </Link>
        {translate('library.infoSuffix')}
      </div>

      {filteredWorkflows.length === 0 && !searchInput ? (
        <EmptyWorkflowState />
      ) : filteredWorkflows.length === 0 && searchInput ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-foreground/50">
            {translate('library.noMatching', { search: searchInput })}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* New Workflow card */}
          <Button
            asChild
            className="group flex items-center justify-center rounded-lg border-2 border-dashed border-border bg-card/40 p-4 transition-[border-color,background-color] duration-200 hover:border-border-strong hover:bg-card/60"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <Link href={href(APP_ROUTES.AUTOMATE.WORKFLOWS_NEW)}>
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
                    {isSystemWorkflow ? (
                      <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs text-info">
                        {translate('library.system')}
                      </span>
                    ) : null}
                    {isCapable && isConnected && workflow.cloudSync ? (
                      <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                        <Cloud className="size-3" />
                        {translate('library.synced')}
                      </span>
                    ) : isCapable && isConnected && !workflow.cloudSync ? (
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
                      onSchedule={
                        isSystemWorkflow
                          ? undefined
                          : () => setSchedulingWorkflowId(workflow.id)
                      }
                    />
                  </div>
                }
                bodyClassName="h-full justify-between"
              >
                <Link
                  href={href(`${APP_ROUTES.AUTOMATE.WORKFLOWS}/${workflow.id}`)}
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
                      {isSystemWorkflow ? (
                        <span className="shrink-0 text-foreground/40">
                          {translate('library.platformManaged')}
                        </span>
                      ) : (
                        <Switch
                          checked={workflow.isScheduleEnabled ?? false}
                          aria-label={`${workflow.isScheduleEnabled ? 'Disable' : 'Enable'} schedule for ${workflow.label}`}
                          onCheckedChange={(checked) =>
                            handleToggleSchedule(workflow.id, checked)
                          }
                        />
                      )}
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
