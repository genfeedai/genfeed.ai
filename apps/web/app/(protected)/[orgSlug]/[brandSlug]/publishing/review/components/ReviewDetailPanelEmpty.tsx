import { CardPadding, CardVariant } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { MessageSquare, MousePointerClick } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ReviewDetailPanelEmpty() {
  const translate = useTranslations('pages.publishing.review');
  return (
    <Card
      padding={CardPadding.XL}
      isCentered
      bodyClassName="min-h-[240px] flex-col items-center justify-center"
    >
      <div className="flex items-center gap-2">
        <Card variant={CardVariant.INSET} padding={CardPadding.SM}>
          <MousePointerClick className="size-5 text-muted-foreground" />
        </Card>
        <Card variant={CardVariant.INSET} padding={CardPadding.SM}>
          <MessageSquare className="size-5 text-muted-foreground" />
        </Card>
      </div>
      <h2 className="mt-4 text-sm font-semibold text-foreground">
        {translate('detail.emptyTitle')}
      </h2>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        {translate('detail.emptyDescription')}
      </p>
    </Card>
  );
}
