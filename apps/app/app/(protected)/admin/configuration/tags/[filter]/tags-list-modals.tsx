'use client';

import { PageScope, TagCategory } from '@genfeedai/enums';
import type { ContentScope, ITag } from '@genfeedai/interfaces';
import { LazyModalTag } from '@ui/lazy/modal/LazyModal';

type TagsListModalsProps = {
  scope: ContentScope;
  selectedTag: ITag | null;
  organizationId: string | undefined;
  onConfirm: () => void;
};

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
