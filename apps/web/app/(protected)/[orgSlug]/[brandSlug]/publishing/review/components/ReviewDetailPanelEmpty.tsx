import { EmptyStateCard } from '@ui/primitives/empty-state';
import { MousePointerClick } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ReviewDetailPanelEmpty() {
  const translate = useTranslations('pages.publishing.review');
  return (
    <EmptyStateCard
      icon={MousePointerClick}
      title={translate('detail.emptyTitle')}
      description={translate('detail.emptyDescription')}
    />
  );
}
