'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useSetupCard } from '@genfeedai/hooks/utils/use-setup-card/use-setup-card';
import Card from '@ui/card/Card';
import { Check, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function SetupCard() {
  const { isVisible, steps, completedCount, totalCount } = useSetupCard();

  if (!isVisible) {
    return null;
  }

  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <Card
      className="mx-3 mb-3 bg-foreground/[0.03] shadow-border"
      bodyClassName="gap-0 p-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xs font-semibold text-foreground/60">
          Complete setup
        </span>
        <span className="text-2xs font-medium text-foreground/30 tabular-nums">
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-0.5">
        {steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className={cn(
              'flex items-center gap-2.5 px-2 py-1.5 text-xs transition-colors duration-150',
              step.isCompleted
                ? 'text-foreground/30'
                : 'text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground/80',
            )}
          >
            {step.isCompleted ? (
              <Check className="size-3.5 text-green-400/60 flex-shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 flex-shrink-0 text-foreground/20" />
            )}
            <span className={cn(step.isCompleted && 'line-through')}>
              {step.label}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
