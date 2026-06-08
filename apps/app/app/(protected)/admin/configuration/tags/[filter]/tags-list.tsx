'use client';

import { EMPTY_STATES } from '@genfeedai/constants';
import { ModalEnum } from '@genfeedai/enums';
import type { ITag } from '@genfeedai/interfaces';
import type { TagsListProps } from '@props/tags/tags-list.props';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import { Switch } from '@ui/primitives/switch';
import { Suspense, useMemo } from 'react';
import { HiPencil, HiTrash } from 'react-icons/hi2';
import {
  TagAccountCell,
  TagCategoryCell,
  TagDescriptionCell,
  TagKeyCell,
  TagLabelCell,
  TagOrgCell,
} from './tags-list-columns';
import TagsListModals from './tags-list-modals';
import { useTagsList } from './use-tags-list';

function TagsListContent(props: TagsListProps) {
  const {
    adminBrand,
    adminOrg,
    canEditTag,
    filteredAndSortedTags,
    handleAdminBrandChange,
    handleAdminOrgChange,
    handleToggleActive,
    isLoading,
    openDeleteConfirm,
    openTagModal,
    organizationId,
    refresh,
    scope,
    selectedTag,
    setSelectedTag,
  } = useTagsList(props);

  const columns = useMemo(
    () => [
      {
        header: 'Label',
        key: 'label',
        render: (t: ITag) => <TagLabelCell tag={t} />,
      },
      {
        header: 'Description',
        key: 'description',
        render: (t: ITag) => <TagDescriptionCell tag={t} />,
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
              icon: <HiPencil />,
              onClick: (tag: ITag) => openTagModal(ModalEnum.TAG, tag),
              tooltip: 'Edit',
            },
            {
              icon: <HiTrash />,
              onClick: openDeleteConfirm,
              tooltip: 'Delete',
            },
          ]
        : [
            {
              icon: <HiPencil />,
              isVisible: canEditTag,
              onClick: (tag: ITag) => openTagModal(ModalEnum.TAG, tag),
              tooltip: 'Edit',
            },
          ],
    [scope, canEditTag, openTagModal, openDeleteConfirm],
  );

  return (
    <>
      {scope === 'superadmin' && (
        <div className="mb-4">
          <AdminOrgBrandFilter
            organization={adminOrg}
            brand={adminBrand}
            onOrganizationChange={handleAdminOrgChange}
            onBrandChange={handleAdminBrandChange}
          />
        </div>
      )}

      <AppTable<ITag>
        items={filteredAndSortedTags}
        actions={actions}
        columns={columns}
        isLoading={isLoading}
        getRowKey={(t) => t.id}
        emptyLabel={EMPTY_STATES.TAGS_YET}
      />

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
