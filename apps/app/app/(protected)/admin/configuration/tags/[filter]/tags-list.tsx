import { ModalEnum } from '@genfeedai/contracts';
import { EMPTY_STATES } from '@genfeedai/contracts/constants';
import type { ITag } from '@genfeedai/contracts/interfaces';
import type { TagsListProps } from '@props/tags/tags-list.props';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Switch } from '@ui/primitives/switch';
import { Pencil, Trash2 } from 'lucide-react';
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

  return (
    <>
      <AppTable<ITag>
        items={filteredAndSortedTags}
        actions={actions}
        columns={columns}
        isLoading={isLoading}
        getRowKey={(t) => t.id}
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
