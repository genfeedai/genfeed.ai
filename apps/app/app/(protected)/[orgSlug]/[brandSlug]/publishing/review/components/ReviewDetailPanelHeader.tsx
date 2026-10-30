import { ComponentSize } from '@genfeedai/contracts';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { useTranslations } from 'next-intl';
import type { ReviewDetailPanelHeaderProps } from '@/features/posts/props/review-detail-panel-header.props';
import { getReviewItemBadgeStatus } from './review-item.helpers';

export default function ReviewDetailPanelHeader({
  item,
  statusLabel,
}: ReviewDetailPanelHeaderProps) {
  const translate = useTranslations('pages.publishing.review');
  const title =
    item.caption?.trim() ||
    item.prompt?.trim() ||
    (item.postId
      ? translate('titles.draftPost')
      : translate('titles.reviewItem'));

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {translate('approvalQueue.title')}
        </p>
        <h2 className="mt-1 line-clamp-2 text-base font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{statusLabel}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {item.platform ? (
          <PlatformBadge platform={item.platform} size={ComponentSize.SM} />
        ) : null}
        <Badge status={getReviewItemBadgeStatus(item)} size={ComponentSize.SM}>
          {statusLabel}
        </Badge>
        {item.format ? (
          <Badge status={item.format} size={ComponentSize.SM} />
        ) : null}
      </div>
    </div>
  );
}
