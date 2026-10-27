'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import PaginationStepper from '@ui/navigation/pagination/PaginationStepper';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import Spinner from '@ui/primitives/spinner';
import { ExternalLink, Paperclip, Zap } from 'lucide-react';

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
        <FormSearchbar
          ariaLabel="Search authorized workflows"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search this page"
          size={ComponentSize.MD}
          value={search}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!activeBrandId ? (
          <div className="gen-shell-empty-state p-4 text-sm text-muted-foreground">
            Select a brand in the scoped controls before choosing a workflow.
          </div>
        ) : isLoading ? (
          <div
            aria-live="polite"
            className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
          >
            <Spinner aria-hidden="true" size={ComponentSize.SM} />
            Loading authorized workflows…
          </div>
        ) : error ? (
          <div className="gen-shell-empty-state space-y-3 p-4 text-sm">
            <p className="text-destructive">{error}</p>
            <Button
              onClick={retry}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
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
              <Card bodyClassName="gap-0 p-3" key={workflow.id}>
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Zap className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-medium text-foreground">
                        {workflow.label}
                      </h3>
                      <Badge variant="secondary">{workflow.lifecycle}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {workflow.description ??
                        'Deterministic reusable automation workflow.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        icon={<Paperclip className="size-4" />}
                        onClick={() => onAttachWorkflow(workflow)}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.DEFAULT}
                        withWrapper={false}
                      >
                        Use in request
                      </Button>
                      <Button
                        icon={<ExternalLink className="size-4" />}
                        onClick={() => onOpenWorkflow(workflow)}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.SECONDARY}
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
        <PaginationStepper
          className="gap-2"
          hasNext={hasNextPage}
          hasPrevious={page > 1}
          isDisabled={isLoading}
          nextLabel="Next workflow page"
          onNext={() => setPage((current) => current + 1)}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          previousLabel="Previous workflow page"
          status={`Page ${page}`}
        />
      </div>
    </div>
  );
}
