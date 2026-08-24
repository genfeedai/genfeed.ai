'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { SetupCardStep } from '@hooks/utils/use-setup-card/use-setup-card';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

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
    <Card
      id="setup-checklist"
      label="Setup checklist"
      description="Review every setup step"
      bodyClassName="gap-3 p-4"
      headerAction={
        <Badge variant="outline" className="px-3 py-1 text-xs font-medium">
          {completedCount}/{totalCount} complete
        </Badge>
      }
    >
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{
            width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
          }}
        />
      </div>

      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.key}
            className={cn(
              'flex items-center justify-between gap-3 rounded-2xl border px-4 py-4',
              step.isCompleted
                ? 'border-success/20 bg-success/[0.06]'
                : 'border-border bg-background-secondary',
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
                'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-8',
                step.isCompleted
                  ? 'border border-border text-muted-foreground hover:bg-muted/60'
                  : 'border border-primary/25 bg-primary/10 text-foreground hover:bg-primary/15',
              )}
            >
              {step.isCompleted ? 'Review' : 'Complete'}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}
