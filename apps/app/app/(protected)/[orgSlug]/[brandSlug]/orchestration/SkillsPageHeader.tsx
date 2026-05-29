'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiOutlineArrowPath, HiOutlineSparkles } from 'react-icons/hi2';

const SOURCE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Built-in', value: 'built_in' },
  { label: 'Imported', value: 'imported' },
  { label: 'Custom', value: 'custom' },
] as const;

type SourceFilterValue = (typeof SOURCE_FILTERS)[number]['value'];

type Props = {
  brandLabel: string | undefined;
  onRefresh: () => void;
  onSourceFilterChange: (value: SourceFilterValue) => void;
  sourceFilter: SourceFilterValue;
};

export default function SkillsPageHeader({
  brandLabel,
  onRefresh,
  onSourceFilterChange,
  sourceFilter,
}: Props) {
  return (
    <Card
      bodyClassName="gap-4 p-6"
      className="rounded-3xl border-white/10 bg-black/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">
            Agent Skills
          </p>
          <h1 className="text-3xl font-semibold text-foreground">
            Brand content behavior
          </h1>
          <p className="max-w-3xl text-sm text-foreground/60">
            Browse built-in Genfeed skills and customize them into org-owned
            variants for{' '}
            <span className="font-medium text-foreground">
              {brandLabel || 'this brand'}
            </span>
            . Skill enablement is managed via brand agent configuration.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-full"
            onClick={onRefresh}
            variant={ButtonVariant.OUTLINE}
          >
            <HiOutlineArrowPath className="size-4" />
            Refresh
          </Button>
          <Button
            asChild
            className="rounded-full"
            variant={ButtonVariant.OUTLINE}
          >
            <Link href="/chat">
              <HiOutlineSparkles className="size-4" />
              Open Chat
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SOURCE_FILTERS.map((filter) => (
          <Button
            className="rounded-full"
            key={filter.value}
            onClick={() => onSourceFilterChange(filter.value)}
            variant={
              sourceFilter === filter.value
                ? ButtonVariant.DEFAULT
                : ButtonVariant.OUTLINE
            }
          >
            {filter.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}
