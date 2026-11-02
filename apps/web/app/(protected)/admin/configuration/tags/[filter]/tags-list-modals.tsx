import { PageScope } from '@genfeedai/contracts';
import { LazyModalTag } from '@/components/lazy/modal/LazyModal';
import type { TagsListModalsProps } from '@/features/admin/props/tags.props';

export default function TagsListModals({
  scope,
  onConfirm,
}: TagsListModalsProps) {
  if (scope !== PageScope.SUPERADMIN && scope !== PageScope.ORGANIZATION) {
    return null;
  }

  return <LazyModalTag onConfirm={onConfirm} />;
}
