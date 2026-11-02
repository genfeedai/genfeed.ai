import { EMPTY_STATES } from '@genfeedai/contracts/constants';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { normalizeElementKey } from '@ui/display/element-scope-badge/element-row-sidebar';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Badge } from '@ui/primitives/badge';
import { Switch } from '@ui/primitives/switch';
import { TAG_CATEGORY_OPTIONS } from '@ui-constants/tags.constant';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useMemo } from 'react';
import type { TagsListProps } from '@/features/admin/props/tags-list.props';
import {
  TagAccountCell,
  TagCategoryCell,
  TagKeyCell,
  TagLabelCell,
  TagOrgCell,
} from './tags-list-columns';
import TagsListModals from './tags-list-modals';
import { useTagsList } from './use-tags-list';

function TagsListContent(props: TagsListProps) {
  const rowSidebarT = useTranslations('ui.rowSidebar');
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const {
    canEditTag,
    filteredAndSortedTags,
    pageTotals,
    handleToggleActive,
    isLoading,
    isRefreshing,
    onSortChange,
    openDeleteConfirm,
    refresh,
    saveTag,
    scope,
    sortDirection,
    sortKey,
  } = useTagsList(props);

  useEffect(() => {
    props.onRefreshingChange?.(isRefreshing);
  }, [isRefreshing, props.onRefreshingChange]);

  const columns = useMemo(
    () => [
      {
        header: 'Label',
        key: 'label',
        sortable: true,
        render: (t: ITag) => <TagLabelCell tag={t} />,
        subtext: (t: ITag) => t.description,
      },
      {
        header: 'Key',
        key: 'key',
        sortable: true,
        render: (t: ITag) => <TagKeyCell tag={t} />,
      },
      {
        header: 'Category',
        key: 'category',
        sortable: true,
        render: (t: ITag) => <TagCategoryCell tag={t} />,
      },
      ...(scope === 'superadmin' ||
      (props.filter !== 'default' && props.filter !== 'organization')
        ? [
            {
              header: 'Organization',
              key: 'organization',
              render: (t: ITag) => <TagOrgCell tag={t} />,
            },
          ]
        : []),
      ...(scope === 'superadmin' ||
      (props.filter !== 'default' && props.filter !== 'account')
        ? [
            {
              header: 'Account',
              key: 'user',
              render: (t: ITag) => <TagAccountCell tag={t} />,
            },
          ]
        : []),
      {
        header: 'Active',
        key: 'isActive',
        sortable: true,
        render: (tag: ITag) => (
          <Switch
            isChecked={tag.isActive !== false}
            onChange={() => handleToggleActive(tag)}
          />
        ),
      },
    ],
    [scope, props.filter, handleToggleActive],
  );

  const actions = useMemo(
    () =>
      scope === 'superadmin'
        ? [
            {
              icon: <Trash2 />,
              onClick: openDeleteConfirm,
              tooltip: 'Delete',
            },
          ]
        : [],
    [scope, openDeleteConfirm],
  );

  const rowSidebar = useMemo(
    () =>
      createSummaryRowSidebar<ITag>({
        getBadges: (tag) => (
          <>
            <TagLabelCell tag={tag} />
            <TagCategoryCell tag={tag} />
            {tag.isActive === false ? (
              <Badge variant="warning">{rowSidebarT('inactive')}</Badge>
            ) : null}
          </>
        ),
        getFacts: (tag) => {
          const isEditable = scope === 'superadmin' || canEditTag(tag);

          return [
            {
              editor: isEditable
                ? {
                    ariaLabel: fieldsT('label'),
                    isRequired: true,
                    kind: 'text',
                    onSave: (label) => saveTag(tag.id, { label }),
                    value: tag.label,
                  }
                : undefined,
              id: 'label',
              label: fieldsT('label'),
              value: tag.label,
            },
            {
              editor: isEditable
                ? {
                    ariaLabel: fieldsT('key'),
                    isRequired: true,
                    kind: 'text',
                    onSave: (key) =>
                      saveTag(tag.id, { key: normalizeElementKey(key) }),
                    value: tag.key,
                  }
                : undefined,
              id: 'key',
              label: fieldsT('key'),
              value: tag.key,
            },
            {
              editor: isEditable
                ? {
                    ariaLabel: fieldsT('category'),
                    kind: 'select',
                    onSave: (category) =>
                      saveTag(tag.id, {
                        category: (category || undefined) as ITag['category'],
                      }),
                    options: TAG_CATEGORY_OPTIONS,
                    value: tag.category ?? '',
                  }
                : undefined,
              id: 'category',
              label: fieldsT('category'),
              value: tag.category,
            },
            {
              editor: isEditable
                ? {
                    ariaLabel: fieldsT('description'),
                    isMultiline: true,
                    kind: 'text',
                    onSave: (description) => saveTag(tag.id, { description }),
                    placeholder: '-',
                    value: tag.description,
                  }
                : undefined,
              id: 'description',
              label: fieldsT('description'),
              value: tag.description,
            },
            ...(isEditable
              ? [
                  {
                    editor: {
                      ariaLabel: fieldsT('backgroundColor'),
                      kind: 'color' as const,
                      onSave: (backgroundColor: string) =>
                        saveTag(tag.id, { backgroundColor }),
                      value: tag.backgroundColor,
                    },
                    id: 'backgroundColor',
                    label: fieldsT('backgroundColor'),
                  },
                  {
                    editor: {
                      ariaLabel: fieldsT('textColor'),
                      kind: 'color' as const,
                      onSave: (textColor: string) =>
                        saveTag(tag.id, { textColor }),
                      value: tag.textColor,
                    },
                    id: 'textColor',
                    label: fieldsT('textColor'),
                  },
                ]
              : []),
            {
              id: 'organization',
              label: fieldsT('organization'),
              value: tag.organization?.label,
            },
            {
              id: 'account',
              label: fieldsT('account'),
              value: tag.user?.email,
            },
          ];
        },
        getId: (tag) => tag.id,
        getSubtitle: (tag) => tag.key,
        getTitle: (tag) => tag.label,
        kind: 'record',
      }),
    [scope, canEditTag, saveTag, rowSidebarT, fieldsT],
  );

  return (
    <>
      <AppTable<ITag>
        items={filteredAndSortedTags}
        actions={actions}
        columns={columns}
        isLoading={isLoading}
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        getRowKey={(t) => t.id}
        rowSidebar={rowSidebar}
        emptyLabel={EMPTY_STATES.TAGS_FOUND}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="tags" totals={pageTotals} />
      </div>

      <TagsListModals
        scope={scope}
        onConfirm={() => {
          refresh();
        }}
      />
    </>
  );
}

export default function TagsList(props: TagsListProps) {
  return (
    <Suspense fallback={null}>
      <TagsListContent {...props} />
    </Suspense>
  );
}
