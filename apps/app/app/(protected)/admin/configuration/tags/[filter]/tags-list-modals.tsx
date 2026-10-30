import { PageScope, TagCategory } from '@genfeedai/contracts';
import { LazyModalTag } from '@ui/lazy/modal/LazyModal';
import type { TagsListModalsProps } from '@/features/admin/props/tags.props';

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
