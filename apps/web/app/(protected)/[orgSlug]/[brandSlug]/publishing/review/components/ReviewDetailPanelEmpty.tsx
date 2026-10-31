import { MessageSquare, MousePointerClick } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function ReviewDetailPanelEmpty() {
  const translate = useTranslations('pages.publishing.review');
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-card bg-card p-6 text-center shadow-border">
      <div className="flex items-center gap-2">
        <div className="rounded-card border border-border bg-background p-2.5">
          <MousePointerClick className="size-5 text-muted-foreground" />
        </div>
        <div className="rounded-card border border-border bg-background p-2.5">
          <MessageSquare className="size-5 text-muted-foreground" />
        </div>
      </div>
      <h2 className="mt-4 text-sm font-semibold text-foreground">
        {translate('detail.emptyTitle')}
      </h2>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        {translate('detail.emptyDescription')}
      </p>
    </div>
  );
}
