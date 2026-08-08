'use client';

import { ButtonSize, ButtonVariant, CardVariant } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Check, X } from 'lucide-react';

import ReviewItemsTable from './ReviewItemsTable';

interface ReviewGridProps {
  activeItem: IBatchItem | null;
  isActioning: boolean;
  items: IBatchItem[];
  selectedIds: Set<string>;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onSelectItem: (itemId: string) => void;
  onToggleSelect: (itemId: string) => void;
}

/**
 * Table-only review canvas. Item detail + decisions live in the agent
 * Context rail via ReviewWorkspaceSurfaceAdapter.
 */
export default function ReviewGrid({
  activeItem,
  isActioning,
  items,
  selectedIds,
  onBulkApprove,
  onBulkReject,
  onSelectItem,
  onToggleSelect,
}: ReviewGridProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {selectedIds.size > 0 ? (
        <Card
          // Card body defaults to flex-col — force a single horizontal row.
          bodyClassName="flex flex-row flex-wrap items-center justify-between gap-2 !p-3"
          className="bg-background-secondary"
          variant={CardVariant.DEFAULT}
        >
          <p className="shrink-0 text-xs text-foreground/70">
            <span className="font-semibold text-foreground">
              {selectedIds.size}
            </span>{' '}
            selected
          </p>
          {/* ModalConfirm grammar: primary first, destructive last (right). */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              className="h-7 gap-1 px-2 text-xs"
              isDisabled={isActioning}
              onClick={onBulkApprove}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            >
              <Check className="size-3.5" />
              Approve
            </Button>
            <Button
              className="h-7 gap-1 px-2 text-xs"
              isDisabled={isActioning}
              onClick={onBulkReject}
              size={ButtonSize.SM}
              variant={ButtonVariant.DESTRUCTIVE}
              withWrapper={false}
            >
              <X className="size-3.5" />
              Reject
            </Button>
          </div>
        </Card>
      ) : null}

      <ReviewItemsTable
        activeItemId={activeItem?.id ?? null}
        items={items}
        selectedIds={selectedIds}
        onSelectItem={onSelectItem}
        onToggleSelect={onToggleSelect}
      />
    </div>
  );
}
