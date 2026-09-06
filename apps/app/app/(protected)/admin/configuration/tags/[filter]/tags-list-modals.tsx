'use client';

import { PageScope, TagCategory } from '@genfeedai/contracts';
import type { TagsListModalsProps } from '@props/admin/tags.props';
import { LazyModalTag } from '@ui/lazy/modal/LazyModal';

export default function TagsListModals({
  scope,
  selectedTag,
  organizationId,
  onConfirm,
}: TagsListModalsProps) {
  if (scope === PageScope.SUPERADMIN) {
    return (
      <LazyModalTag
        item={selectedTag}
        entityType={TagCategory.CREDENTIAL}
        onConfirm={onConfirm}
      />
    );
  }

  if (scope === PageScope.ORGANIZATION) {
    return (
      <LazyModalTag
        item={selectedTag}
        entityType={TagCategory.ORGANIZATION}
        entityId={organizationId}
        onConfirm={onConfirm}
      />
    );
  }

  return null;
}
