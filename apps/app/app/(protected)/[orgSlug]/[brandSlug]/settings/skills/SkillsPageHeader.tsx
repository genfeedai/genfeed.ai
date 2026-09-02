'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { RefreshCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { SOURCE_FILTERS, type SourceFilterValue } from './skill-filter-options';

type Props = {
  agentHref: string;
  brandLabel: string | undefined;
  onRefresh: () => void;
  onSourceFilterChange: (value: SourceFilterValue) => void;
  sourceFilter: SourceFilterValue;
};

export default function SkillsPageHeader({
  agentHref,
  brandLabel,
  onRefresh,
  onSourceFilterChange,
  sourceFilter,
}: Props) {
  const translate = useTranslations('common.settings.skills');

  return (
    <Card bodyClassName="gap-4 p-6" className="rounded-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            {translate('heading')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {translate('title', {
              brand: brandLabel || translate('thisBrand'),
            })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-full"
            onClick={onRefresh}
            variant={ButtonVariant.SECONDARY}
          >
            <RefreshCw className="size-4" />
            {translate('actions.refresh')}
          </Button>
          <Button
            asChild
            className="rounded-full"
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={agentHref}>
              <Sparkles className="size-4" />
              {translate('actions.openAgent')}
            </Link>
          </Button>
        </div>
      </div>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{translate('filters.source.label')}</legend>
        {SOURCE_FILTERS.map((filter) => (
          <Button
            aria-pressed={sourceFilter === filter.value}
            className="rounded-full"
            key={filter.value}
            onClick={() => onSourceFilterChange(filter.value)}
            variant={
              sourceFilter === filter.value
                ? ButtonVariant.DEFAULT
                : ButtonVariant.SECONDARY
            }
          >
            {translate(`filters.source.${filter.labelKey}`)}
          </Button>
        ))}
      </fieldset>
    </Card>
  );
}
