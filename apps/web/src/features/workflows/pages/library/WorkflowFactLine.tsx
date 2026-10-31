'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { describeCadence } from '@/features/workflows/components/schedule/schedule-cadence';
import type { WorkflowFactLineProps } from './workflow-library.types';

const FACT_SEPARATOR = '·';

/** One line of known facts: schedule (next run or paused), then last update. */
export default function WorkflowFactLine({
  workflow,
  className,
}: WorkflowFactLineProps) {
  const translate = useTranslations('common.automation.workflows.library');
  const cadence = describeCadence(workflow.schedule);

  return (
    <span
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5',
        className,
      )}
      data-testid="workflow-fact-line"
    >
      {cadence ? (
        <>
          <span className="inline-flex min-w-0 items-center gap-1">
            <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{cadence}</span>
          </span>
          {workflow.isScheduleEnabled && workflow.nextRunAt ? (
            <>
              <span aria-hidden="true">{FACT_SEPARATOR}</span>
              <span>
                {translate('nextRun')}{' '}
                <ClientFormattedDate
                  format="relative"
                  value={workflow.nextRunAt}
                />
              </span>
            </>
          ) : workflow.isScheduleEnabled ? null : (
            <>
              <span aria-hidden="true">{FACT_SEPARATOR}</span>
              <span>{translate('paused')}</span>
            </>
          )}
          <span aria-hidden="true">{FACT_SEPARATOR}</span>
        </>
      ) : null}
      <span>
        {translate('updated')}{' '}
        <ClientFormattedDate format="relative" value={workflow.updatedAt} />
      </span>
    </span>
  );
}
