'use client';

import type { IPlatformElement } from '@genfeedai/contracts/interfaces';
import type {
  ElementRowSidebarConfig,
  ElementRowSidebarItem,
} from '@genfeedai/props/ui/display/element-row-sidebar.props';
import type { TableRowSidebar } from '@genfeedai/props/ui/display/table.props';
import type { SummaryFact } from '@genfeedai/props/ui/display/table-row-summary.props';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import { useTranslations } from 'next-intl';

/** Catalog keys are lowercase, alphanumeric and hyphenated. */
export function normalizeElementKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

type FieldsTranslator = (key: string) => string;

/**
 * The facts every catalog element shares: label, key, description, active and
 * sort order. With `onSave` they are edited in place; without it, read-only.
 */
export function buildElementFacts<T extends ElementRowSidebarItem>(
  t: FieldsTranslator,
  item: T,
  onSave?: (item: T, patch: Partial<IPlatformElement>) => Promise<void>,
): SummaryFact[] {
  return [
    {
      editor: onSave
        ? {
            ariaLabel: t('label'),
            isRequired: true,
            kind: 'text',
            onSave: (label) => onSave(item, { label }),
            value: item.label,
          }
        : undefined,
      id: 'label',
      label: t('label'),
      value: item.label,
    },
    {
      editor: onSave
        ? {
            ariaLabel: t('key'),
            isRequired: true,
            kind: 'text',
            onSave: (key) => onSave(item, { key: normalizeElementKey(key) }),
            value: item.key,
          }
        : undefined,
      id: 'key',
      label: t('key'),
      value: item.key,
    },
    {
      editor: onSave
        ? {
            ariaLabel: t('description'),
            isMultiline: true,
            kind: 'text',
            onSave: (description) => onSave(item, { description }),
            placeholder: '-',
            value: item.description,
          }
        : undefined,
      id: 'description',
      label: t('description'),
      value: item.description,
    },
    ...(onSave
      ? [
          {
            editor: {
              ariaLabel: t('active'),
              isChecked: item.isActive !== false,
              kind: 'switch' as const,
              onSave: (isActive: boolean) => onSave(item, { isActive }),
            },
            id: 'active',
            label: t('active'),
          },
          {
            editor: {
              ariaLabel: t('sortOrder'),
              kind: 'number' as const,
              onSave: (sortOrder: number) => onSave(item, { sortOrder }),
              value: item.sortOrder ?? 0,
            },
            id: 'sortOrder',
            label: t('sortOrder'),
          },
        ]
      : []),
  ];
}

/**
 * `rowSidebar` of a catalog element table (cameras, lenses, moods, ...): the
 * shared element facts plus any type-specific ones. With `onSave` they are
 * edited in place; without it the panel is read-only.
 */
export function useElementRowSidebar<T extends ElementRowSidebarItem>({
  getExtraFacts,
  onSave,
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
      ...buildElementFacts(t, item, onSave),
      ...(getExtraFacts?.(item) ?? []),
    ],
    getId: (item) => item.id,
    getSubtitle: (item) => item.key,
    getTitle: (item) => item.label,
    kind: 'record',
  });
}
