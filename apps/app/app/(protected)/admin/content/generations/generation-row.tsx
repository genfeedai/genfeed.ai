'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { GenerationRowProps } from '@props/admin/generations.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import GenerationStatusBadge from './generation-status-badge';
import GenerationThumbnail from './generation-thumbnail';

/** A row opens the detail in the right sidebar; the prompt is clamped to two lines. */
export default function GenerationRow({
  generation,
  onOpen,
}: GenerationRowProps) {
  const t = useTranslations('pages.adminGenerations');
  const owner = [generation.userLabel, generation.organizationLabel]
    .filter(Boolean)
    .join(' · ');
  const prompt =
    generation.compiled || generation.enhanced || generation.original;

  return (
    <Card bodyClassName="p-0" className="hover:bg-muted/40">
      <Button
        ariaLabel={t('open', { id: generation.id })}
        className="grid w-full grid-cols-[72px_minmax(0,1fr)] items-start gap-3 p-3 text-left sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:gap-4"
        onClick={() => onOpen(generation)}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      >
        <div className="w-[72px] sm:w-[104px]">
          <GenerationThumbnail generation={generation} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <GenerationStatusBadge status={generation.status} />
            {generation.kind === 'prompt' ? (
              <span>{t('promptOnly')}</span>
            ) : null}
            {generation.model ? (
              <span className="font-mono">{generation.model}</span>
            ) : null}
          </div>
          <p className="line-clamp-2 text-sm leading-snug">
            {generation.original || prompt}
          </p>
        </div>
        <div className="col-span-full flex flex-row flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground sm:col-span-1 sm:flex-col sm:items-end sm:text-right">
          {owner ? <span className="truncate">{owner}</span> : null}
          <ClientFormattedDate value={generation.createdAt} />
          {generation.credits !== null ? (
            <span className="tabular-nums">
              {t('credits', { count: generation.credits })}
            </span>
          ) : null}
        </div>
      </Button>
    </Card>
  );
}
