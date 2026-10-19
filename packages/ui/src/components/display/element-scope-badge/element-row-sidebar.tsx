'use client';

import type {
  ElementRowSidebarConfig,
  ElementRowSidebarItem,
} from '@genfeedai/props/ui/display/element-row-sidebar.props';
import type { TableRowSidebar } from '@genfeedai/props/ui/display/table.props';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import { useTranslations } from 'next-intl';

/**
 * `rowSidebar` of a catalog element table (cameras, lenses, moods, ...): key,
 * scope and any type-specific facts, with Edit when the caller can edit.
 */
export function useElementRowSidebar<T extends ElementRowSidebarItem>({
  getExtraFacts,
  onEdit,
}: ElementRowSidebarConfig<T> = {}): TableRowSidebar<T> {
  const t = useTranslations('ui.rowSidebar.fields');

  return createSummaryRowSidebar<T>({
    getBadges: (item) => (
      <ElementScopeBadge
        isActive={item.isActive}
        isPlatformDefault={item.isPlatformDefault}
      />
    ),
    getFacts: (item) => [
      { id: 'key', label: t('key'), value: item.key },
      { id: 'description', label: t('description'), value: item.description },
      ...(getExtraFacts?.(item) ?? []),
    ],
    getId: (item) => item.id,
    getSubtitle: (item) => item.key,
    getTitle: (item) => item.label,
    kind: 'record',
    onEdit,
  });
}
