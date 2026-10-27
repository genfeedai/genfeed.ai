import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PaginationStepperProps } from '@genfeedai/props/ui/navigation/pagination.props';
import { Button } from '@ui/primitives/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Compact previous / next pager for sidebars, panels and lists that show
 * "Page X of Y" instead of numbered links. Use `Pagination` for URL-driven
 * numbered pagination.
 */
export default function PaginationStepper({
  className,
  hasNext,
  hasPrevious,
  isDisabled = false,
  nextLabel,
  onNext,
  onPrevious,
  previousLabel,
  status,
}: PaginationStepperProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <Button
        ariaLabel={previousLabel}
        icon={<ChevronLeft className="size-4" />}
        isDisabled={isDisabled || !hasPrevious}
        onClick={onPrevious}
        size={ButtonSize.ICON}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
      <span className="flex-1 text-center text-xs tabular-nums text-muted-foreground">
        {status}
      </span>
      <Button
        ariaLabel={nextLabel}
        icon={<ChevronRight className="size-4" />}
        isDisabled={isDisabled || !hasNext}
        onClick={onNext}
        size={ButtonSize.ICON}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
    </div>
  );
}
