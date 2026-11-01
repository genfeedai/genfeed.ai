import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Progress } from '@ui/primitives/progress';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { PERSONAL_SETTINGS_ANCHOR } from '@/config/personal-settings-anchor';
import type { Props } from '@/features/settings/props/settings-progress-checklist-card.props';

export default function SettingsProgressChecklistCard({
  completedCount,
  totalCount,
  steps,
}: Props) {
  return (
    <Card
      id={PERSONAL_SETTINGS_ANCHOR.SETUP_CHECKLIST}
      label="Setup checklist"
      bodyClassName="gap-3 p-4"
      headerAction={
        <Badge variant="outline">
          {completedCount}/{totalCount} complete
        </Badge>
      }
    >
      <Progress
        aria-label={`${completedCount} of ${totalCount} complete`}
        value={totalCount > 0 ? (completedCount / totalCount) * 100 : 0}
      />

      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.key}
            className={cn(
              'flex items-center justify-between gap-3 rounded-2xl border px-4 py-4',
              step.isCompleted
                ? 'border-success/20 bg-success/5'
                : 'border-border bg-card',
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
                  : 'border border-primary/20 bg-primary/10 text-foreground hover:bg-primary/10',
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
