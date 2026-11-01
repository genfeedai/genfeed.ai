import { CardEmptySize } from '@genfeedai/contracts';
import { EmptyState } from '@ui/primitives/empty-state';
import { MousePointerClick } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ReviewDetailPanelEmpty() {
  const translate = useTranslations('pages.publishing.review');
  return (
    <EmptyState
      description={translate('detail.emptyDescription')}
      icon={MousePointerClick}
      size={CardEmptySize.LG}
      surface="card"
      title={translate('detail.emptyTitle')}
    />
  );
}
