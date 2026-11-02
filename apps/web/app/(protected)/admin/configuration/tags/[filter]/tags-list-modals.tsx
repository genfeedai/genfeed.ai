import { PageScope, TagCategory } from '@genfeedai/contracts';
import { LazyModalTag } from '@/components/lazy/modal/LazyModal';
import type { TagsListModalsProps } from '@/features/admin/props/tags.props';

export default function TagsListModals({
  scope,
  organizationId,
  onConfirm,
}: TagsListModalsProps) {
  if (scope === PageScope.SUPERADMIN) {
    return (
      <LazyModalTag entityType={TagCategory.CREDENTIAL} onConfirm={onConfirm} />
    );
  }

  if (scope === PageScope.ORGANIZATION) {
    return (
      <LazyModalTag
        entityType={TagCategory.ORGANIZATION}
        entityId={organizationId}
        onConfirm={onConfirm}
      />
    );
  }

  return null;
}
