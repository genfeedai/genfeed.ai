'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Cloud, CloudUpload } from 'lucide-react';
import Link from 'next/link';
import {
  HiOutlineBolt,
  HiOutlineDocumentDuplicate,
  HiOutlineMagnifyingGlass,
  HiOutlinePlus,
} from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { getLifecycleBadgeClass } from '@/features/workflows/utils/status-helpers';
import EmptyWorkflowState from './EmptyWorkflowState';
import { useWorkflowLibraryPage } from './useWorkflowLibraryPage';
import WorkflowCardDropdown from './WorkflowCardDropdown';
import WorkflowCardPreview from './WorkflowCardPreview';

/**
 * Workflow Library - List of saved workflows with search, cards, and actions
 */
export default function WorkflowLibraryPage() {
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
    filteredWorkflows,
  } = useWorkflowLibraryPage();

  // Loading skeleton
  if (isLoading && workflows.length === 0) {
    return (
      <Container
        label="Workflows"
        description="Use workflows for fixed, reusable automation graphs and scheduled pipelines."
        icon={HiOutlineBolt}
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
                className="h-64 animate-pulse rounded-lg border border-white/[0.06] bg-card"
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
        label="Workflows"
        description="Use workflows for fixed, reusable automation graphs and scheduled pipelines."
        icon={HiOutlineBolt}
      >
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 px-6 text-center">
          <p className="text-destructive">{error}</p>
          <Button
            label="Retry"
            variant={ButtonVariant.OUTLINE}
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
      label="Workflows"
      description="Use workflows for fixed, reusable automation graphs and scheduled pipelines."
      icon={HiOutlineBolt}
      right={
        <>
          <Link href={href('/workflows/templates')}>
            <Button
              label="Templates"
              variant={ButtonVariant.SECONDARY}
              icon={<HiOutlineDocumentDuplicate className="size-4" />}
            />
          </Link>
          <Link href={href('/workflows/new')}>
            <Button
              label="New Workflow"
              variant={ButtonVariant.DEFAULT}
              icon={<HiOutlinePlus className="size-4" />}
            />
          </Link>
        </>
      }
    >
      {/* Search bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
          <Input
            type="text"
            placeholder="Search workflows..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-10 rounded-lg border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/40 focus-visible:border-white/20 focus-visible:ring-0"
          />
        </div>
        {isLoading && workflows.length > 0 && (
          <div className="size-4 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
        )}
      </div>

      {/* Contextual info */}
      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-foreground/70">
        <span className="font-medium text-foreground">Workflows</span> are
        explicit automation graphs. Schedule a workflow when the steps should be
        predictable and repeatable. For adaptive agent behavior, use{' '}
        <Link
          href={href('/orchestration/autopilot')}
          className="underline underline-offset-2"
        >
          Autopilot
        </Link>
        .
      </div>

      {filteredWorkflows.length === 0 && !searchInput ? (
        <EmptyWorkflowState />
      ) : filteredWorkflows.length === 0 && searchInput ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-foreground/50">
            No workflows matching &ldquo;{searchInput}&rdquo;
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* New Workflow card */}
          <Link
            href={href('/workflows/new')}
            className="group flex items-center justify-center rounded-lg border-2 border-dashed border-white/10 bg-card/40 p-4 transition-all duration-200 hover:border-white/20 hover:bg-card/60"
          >
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex size-14 items-center justify-center rounded-full bg-foreground/5 transition-all duration-300 group-hover:scale-110 group-hover:bg-foreground/10">
                <HiOutlinePlus className="size-7 text-foreground/50" />
              </div>
              <span className="text-sm font-medium text-foreground/70">
                New Workflow
              </span>
            </div>
          </Link>

          {/* Workflow cards */}
          {filteredWorkflows.map((workflow) => (
            <Link key={workflow._id} href={href(`/workflows/${workflow._id}`)}>
              <Card
                className="h-full hover:-translate-y-0.5"
                label={workflow.name}
                description={
                  workflow.description ??
                  'Reusable automation workflow for content operations.'
                }
                headerAction={
                  <div className="flex items-center gap-2">
                    {isCapable && isConnected && workflow.cloudSync ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                        <Cloud className="size-3" />
                        synced
                      </span>
                    ) : isCapable && isConnected && !workflow.cloudSync ? (
                      <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-muted-foreground">
                        <CloudUpload className="size-3" />
                        local
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${getLifecycleBadgeClass(
                        workflow.lifecycle,
                      )}`}
                    >
                      {workflow.lifecycle}
                    </span>
                    <WorkflowCardDropdown
                      onDuplicate={() => handleDuplicate(workflow._id)}
                      onDelete={() => handleDelete(workflow._id)}
                    />
                  </div>
                }
                bodyClassName="h-full justify-between"
              >
                <div className="space-y-3">
                  <WorkflowCardPreview
                    name={workflow.name}
                    thumbnail={workflow.thumbnail}
                  />
                  <div className="flex items-center justify-between text-xs text-foreground/50">
                    <span>
                      Updated{' '}
                      <ClientFormattedDate
                        format="relative"
                        value={workflow.updatedAt}
                      />
                    </span>
                    <span>
                      Created{' '}
                      <ClientFormattedDate
                        format="date"
                        value={workflow.createdAt}
                      />
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
