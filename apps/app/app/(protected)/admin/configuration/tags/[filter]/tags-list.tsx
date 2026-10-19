import { ModalEnum } from '@genfeedai/contracts';
import { EMPTY_STATES } from '@genfeedai/contracts/constants';
import type { ITag } from '@genfeedai/contracts/interfaces';
import type { TagsListProps } from '@props/tags/tags-list.props';
import Badge from '@ui/display/badge/Badge';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Switch } from '@ui/primitives/switch';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useMemo } from 'react';
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
    handleToggleActive,
    isLoading,
    isRefreshing,
    openDeleteConfirm,
    openTagModal,
    organizationId,
    refresh,
    scope,
    selectedTag,
    setSelectedTag,
  } = useTagsList(props);

  useEffect(() => {
    props.onRefreshingChange?.(isRefreshing);
  }, [isRefreshing, props.onRefreshingChange]);

  const columns = useMemo(
    () => [
      {
        header: 'Label',
        key: 'label',
        render: (t: ITag) => <TagLabelCell tag={t} />,
        subtext: (t: ITag) => t.description,
      },
      {
        header: 'Key',
        key: 'key',
        render: (t: ITag) => <TagKeyCell tag={t} />,
      },
      {
        header: 'Category',
        key: 'category',
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
        key: 'active',
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
              icon: <Pencil />,
              onClick: (tag: ITag) => openTagModal(ModalEnum.TAG, tag),
              tooltip: 'Edit',
            },
            {
              icon: <Trash2 />,
              onClick: openDeleteConfirm,
              tooltip: 'Delete',
            },
          ]
        : [
            {
              icon: <Pencil />,
              isVisible: canEditTag,
              onClick: (tag: ITag) => openTagModal(ModalEnum.TAG, tag),
              tooltip: 'Edit',
            },
          ],
    [scope, canEditTag, openTagModal, openDeleteConfirm],
  );

  const rowSidebar = useMemo(
    () =>
      createSummaryRowSidebar<ITag>({
        canEdit: (tag) => scope === 'superadmin' || canEditTag(tag),
        getBadges: (tag) => (
          <>
            <TagLabelCell tag={tag} />
            <TagCategoryCell tag={tag} />
            {tag.isActive === false ? (
              <Badge variant="warning">{rowSidebarT('inactive')}</Badge>
            ) : null}
          </>
        ),
        getFacts: (tag) => [
          { id: 'key', label: fieldsT('key'), value: tag.key },
          {
            id: 'description',
            label: fieldsT('description'),
            value: tag.description,
          },
          {
            id: 'organization',
            label: fieldsT('organization'),
            value: tag.organization?.label,
          },
          { id: 'account', label: fieldsT('account'), value: tag.user?.email },
        ],
        getId: (tag) => tag.id,
        getSubtitle: (tag) => tag.key,
        getTitle: (tag) => tag.label,
        kind: 'record',
        onEdit: (tag) => openTagModal(ModalEnum.TAG, tag),
      }),
    [scope, canEditTag, openTagModal, rowSidebarT, fieldsT],
  );

  return (
    <>
      <AppTable<ITag>
        items={filteredAndSortedTags}
        actions={actions}
        columns={columns}
        isLoading={isLoading}
        getRowKey={(t) => t.id}
        rowSidebar={rowSidebar}
        emptyLabel={EMPTY_STATES.TAGS_YET}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="tags" />
      </div>

      <TagsListModals
        scope={scope}
        selectedTag={selectedTag}
        organizationId={organizationId}
        onConfirm={() => {
          setSelectedTag(null);
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
