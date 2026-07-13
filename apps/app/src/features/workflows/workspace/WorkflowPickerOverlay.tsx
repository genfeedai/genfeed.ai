'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineBolt,
  HiOutlineMagnifyingGlass,
  HiOutlinePaperClip,
} from 'react-icons/hi2';
import type { WorkflowSummary } from '@/features/workflows/services/workflow-api';
import { useWorkflowPicker } from './useWorkflowPicker';

interface WorkflowPickerOverlayProps {
  readonly activeBrandId?: string | null;
  readonly onAttachWorkflow: (workflow: WorkflowSummary) => void;
  readonly onOpenLibrary: () => void;
  readonly onOpenWorkflow: (workflow: WorkflowSummary) => void;
}

export function WorkflowPickerOverlay({
  activeBrandId,
  onAttachWorkflow,
  onOpenLibrary,
  onOpenWorkflow,
}: WorkflowPickerOverlayProps) {
  const {
    error,
    hasNextPage,
    isLoading,
    page,
    retry,
    search,
    setPage,
    setSearch,
    visibleWorkflows,
  } = useWorkflowPicker({ activeBrandId });

  return (
    <div className="flex max-h-[min(62vh,36rem)] min-h-0 flex-col">
      <div className="border-b border-border p-4">
        <div className="relative">
          <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search authorized workflows"
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search this page"
            value={search}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!activeBrandId ? (
          <div className="gen-shell-empty-state p-4 text-sm text-muted-foreground">
            Select a brand in the scoped controls before choosing a workflow.
          </div>
        ) : isLoading ? (
          <div
            aria-live="polite"
            className="animate-pulse p-6 text-center text-sm text-muted-foreground"
          >
            Loading authorized workflows…
          </div>
        ) : error ? (
          <div className="gen-shell-empty-state space-y-3 p-4 text-sm">
            <p className="text-destructive">{error}</p>
            <Button
              onClick={retry}
              size={ButtonSize.SM}
              variant={ButtonVariant.OUTLINE}
              withWrapper={false}
            >
              Retry
            </Button>
          </div>
        ) : visibleWorkflows.length === 0 ? (
          <div className="gen-shell-empty-state p-4 text-sm text-muted-foreground">
            No authorized workflows match this selection.
          </div>
        ) : (
          <div className="space-y-2">
            {visibleWorkflows.map((workflow) => (
              <Card bodyClassName="gap-0 p-3" key={workflow._id}>
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <HiOutlineBolt className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-medium text-foreground">
                        {workflow.name}
                      </h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                        {workflow.lifecycle}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {workflow.description ??
                        'Deterministic reusable automation workflow.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        icon={<HiOutlinePaperClip className="size-4" />}
                        onClick={() => onAttachWorkflow(workflow)}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.DEFAULT}
                        withWrapper={false}
                      >
                        Use in request
                      </Button>
                      <Button
                        icon={
                          <HiOutlineArrowTopRightOnSquare className="size-4" />
                        }
                        onClick={() => onOpenWorkflow(workflow)}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.OUTLINE}
                        withWrapper={false}
                      >
                        Open editor
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <Button
          onClick={onOpenLibrary}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          Full library
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button
            ariaLabel="Previous workflow page"
            disabled={page === 1 || isLoading}
            icon={<HiOutlineArrowLeft className="size-4" />}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
          <Button
            ariaLabel="Next workflow page"
            disabled={!hasNextPage || isLoading}
            icon={<HiOutlineArrowRight className="size-4" />}
            onClick={() => setPage((current) => current + 1)}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </div>
      </div>
    </div>
  );
}
