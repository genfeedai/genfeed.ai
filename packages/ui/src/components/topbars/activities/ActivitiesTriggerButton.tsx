'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Badge from '@ui/display/badge/Badge';
import {
  buttonVariants,
  Button as PrimitiveButton,
} from '@ui/primitives/button';
import { HiBell, HiCheck } from 'react-icons/hi2';

type Props = {
  hasActiveGenerations: boolean;
  hasProcessingTasks: boolean;
  activeRealtimeTaskCount: number;
  hasAllRealtimeTasksDone: boolean;
  totalLegacyCount: number;
};

export default function ActivitiesTriggerButton({
  hasActiveGenerations,
  hasProcessingTasks,
  activeRealtimeTaskCount,
  hasAllRealtimeTasksDone,
  totalLegacyCount,
}: Props) {
  const hasActivity =
    hasActiveGenerations || hasProcessingTasks || activeRealtimeTaskCount > 0;

  const totalActiveCount = totalLegacyCount + activeRealtimeTaskCount;

  return (
    <PrimitiveButton
      aria-label={
        hasActivity
          ? `${totalActiveCount} active task${totalActiveCount > 1 ? 's' : ''}`
          : 'View activities'
      }
      className={cn(
        buttonVariants({
          size: ButtonSize.ICON,
          variant: ButtonVariant.GHOST,
        }),
        'relative flex size-9 items-center justify-center p-2 min-h-0 m-0 transition-colors duration-150',
        hasActivity
          ? 'text-primary hover:bg-background/60'
          : 'text-foreground/70 hover:text-foreground/90 hover:bg-background/60',
      )}
      type="button"
    >
      {(() => {
        if (activeRealtimeTaskCount > 0) {
          return (
            <Badge
              variant="error"
              size={ComponentSize.SM}
              className="absolute -right-1 -top-1 w-5 animate-pulse flex items-center justify-center"
            >
              {activeRealtimeTaskCount}
            </Badge>
          );
        }

        if (hasAllRealtimeTasksDone) {
          return (
            <Badge
              variant="success"
              size={ComponentSize.SM}
              className="absolute -right-1 -top-1 w-5 flex items-center justify-center"
            >
              <HiCheck className="size-3" />
            </Badge>
          );
        }

        if (totalLegacyCount === 0) {
          return null;
        }

        return (
          <Badge
            variant="error"
            size={ComponentSize.SM}
            className="absolute -right-1 -top-1 w-5 animate-pulse flex items-center justify-center"
          >
            {totalLegacyCount}
          </Badge>
        );
      })()}

      <HiBell
        aria-hidden="true"
        className={cn('size-5 transition-colors text-current')}
      />
    </PrimitiveButton>
  );
}
