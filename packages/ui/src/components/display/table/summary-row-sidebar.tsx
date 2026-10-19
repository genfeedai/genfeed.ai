'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  SummaryRowEditButtonProps,
  SummaryRowSidebarConfig,
} from '@genfeedai/props/ui/display/summary-row-sidebar.props';
import type { TableRowSidebar } from '@genfeedai/props/ui/display/table.props';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { Button } from '@ui/primitives/button';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

function SummaryRowEditButton({ label, onClick }: SummaryRowEditButtonProps) {
  const t = useTranslations('ui.rowSidebar');

  return (
    <Button
      icon={<Pencil className="size-3.5" />}
      label={label ?? t('edit')}
      onClick={onClick}
      size={ButtonSize.SM}
      variant={ButtonVariant.SECONDARY}
    />
  );
}

/**
 * Builds the `rowSidebar` of a table whose rows open a read-only summary of
 * the record in the right context sidebar, with an Edit button that opens the
 * table's existing form modal.
 */
export function createSummaryRowSidebar<T>({
  canEdit,
  editLabel,
  getBadges,
  getFacts,
  getId,
  getOpenHref,
  getSubtitle,
  getTitle,
  kind,
  onEdit,
  openLabel,
  renderExtra,
}: SummaryRowSidebarConfig<T>): TableRowSidebar<T> {
  return {
    getId,
    getSubtitle,
    getTitle,
    kind,
    render: (item) => {
      const extra = renderExtra?.(item);
      const isEditable = onEdit !== undefined && (canEdit?.(item) ?? true);

      return (
        <TableRowSummary
          badges={getBadges?.(item)}
          facts={getFacts?.(item)}
          openHref={getOpenHref?.(item)}
          openLabel={openLabel}
        >
          {extra || isEditable ? (
            <>
              {extra}
              {isEditable ? (
                <SummaryRowEditButton
                  label={editLabel}
                  onClick={() => onEdit?.(item)}
                />
              ) : null}
            </>
          ) : null}
        </TableRowSummary>
      );
    },
  };
}
