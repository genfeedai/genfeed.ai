'use client';
import type {
  GenerationReceiptListItemProps,
  GenerationReceiptStatusKey,
} from '@genfeedai/props/content/branded-generation-receipt.props';
import type { BadgeProps } from '@ui/primitives/badge';
import { Badge } from '@ui/primitives/badge';
import { FileText, Film, ImageIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import {
  getGenerationReceiptCost,
  getGenerationReceiptStatus,
} from './generation-receipt-summary.util';

/**
 * The preview pulls in the media player and the authorized-grant client, so
 * it loads only once a row actually has a Studio output to show.
 */
const GenerationReceiptMediaPreview = dynamic(
  () => import('./GenerationReceiptMediaPreview'),
  {
    ssr: false,
    loading: () => (
      <ImageIcon aria-hidden="true" className="size-5 text-muted-foreground" />
    ),
  },
);

const STATUS_VARIANT: Readonly<
  Record<GenerationReceiptStatusKey, BadgeProps['variant']>
> = {
  pending: 'info',
  completed: 'success',
  needsReview: 'warning',
  blocked: 'warning',
  failed: 'destructive',
  cancelled: 'secondary',
};

/**
 * One saved generation in the receipts list: what was made, its status, the
 * model and recorded credit cost, and a preview of a Studio media output.
 */
export default function GenerationReceiptListItem({
  receipt,
  href,
  media,
}: GenerationReceiptListItemProps) {
  const t = useTranslations('pages.generationReceipts.list');
  const format = useFormatter();
  const status = getGenerationReceiptStatus(receipt.state);
  const cost = getGenerationReceiptCost(receipt);
  const kind =
    receipt.contentType === 'image' || receipt.contentType === 'video'
      ? receipt.contentType
      : 'text';
  const kindLabel = t(`kind.${kind}`);
  const costLabel =
    cost.status === 'known'
      ? t('credits', { count: cost.credits })
      : t(`cost.${cost.status}`);
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground/5">
        {media ? (
          <GenerationReceiptMediaPreview ingredient={media} label={kindLabel} />
        ) : kind === 'video' ? (
          <Film aria-hidden="true" className="size-5 text-muted-foreground" />
        ) : kind === 'image' ? (
          <ImageIcon
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
        ) : (
          <FileText
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={href}
          >
            {`${kindLabel} · ${receipt.id}`}
          </Link>
          <Badge variant={STATUS_VARIANT[status]}>
            {t(`status.${status}`)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('model', { model: receipt.execution?.model ?? t('noModel') })} ·{' '}
          {costLabel} ·{' '}
          <time dateTime={receipt.createdAt}>
            {format.dateTime(new Date(receipt.createdAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </p>
      </div>
    </li>
  );
}
