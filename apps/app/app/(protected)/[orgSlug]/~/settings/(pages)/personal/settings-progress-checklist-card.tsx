'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { SetupCardStep } from '@hooks/utils/use-setup-card/use-setup-card';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Link from 'next/link';
import { HiMiniArrowUpRight } from 'react-icons/hi2';

type Props = {
  completedCount: number;
  totalCount: number;
  steps: SetupCardStep[];
};

export default function SettingsProgressChecklistCard({
  completedCount,
  totalCount,
  steps,
}: Props) {
  return (
    <Card className="border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Setup checklist
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Review every setup step
          </h2>
        </div>
        <Badge variant="outline" className="px-3 py-1 text-xs font-medium">
          {completedCount}/{totalCount} complete
        </Badge>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(251,146,60,0.95),rgba(249,115,22,0.65))]"
          style={{
            width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
          }}
        />
      </div>

      <div className="mt-5 space-y-3">
        {steps.map((step) => (
          <div
            key={step.key}
            className={cn(
              'flex items-center justify-between gap-3 rounded-2xl border px-4 py-4',
              step.isCompleted
                ? 'border-emerald-400/15 bg-emerald-400/[0.06]'
                : 'border-white/10 bg-black/10',
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {step.label}
              </p>
              <p className="mt-1 text-sm text-foreground/60">
                {step.description}
              </p>
            </div>

            <Link
              href={step.href}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                step.isCompleted
                  ? 'border border-white/10 text-white/55 hover:bg-white/[0.04]'
                  : 'border border-orange-400/25 bg-orange-400/10 text-orange-100 hover:bg-orange-400/15',
              )}
            >
              {step.isCompleted ? 'Review' : 'Complete'}
              <HiMiniArrowUpRight className="size-3.5" />
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}
