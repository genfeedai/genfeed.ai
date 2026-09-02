'use client';

import { ComponentSize, type ViewType } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ViewToggleProps } from '@genfeedai/props/ui/navigation/view-toggle.props';
import {
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ui/primitives';

function getToggleSize(size: ViewToggleProps['size']) {
  if (size === ComponentSize.LG) {
    return 'lg';
  }

  if (size === ComponentSize.XS || size === ComponentSize.SM) {
    return 'sm';
  }

  return 'default';
}

/** Segmented control for switching between mutually exclusive view types. */
export default function ViewToggle<TView extends ViewType>({
  options,
  activeView,
  onChange,
  className,
  size = ComponentSize.SM,
}: ViewToggleProps<TView>) {
  return (
    <TooltipProvider delayDuration={200}>
      <ToggleGroup
        aria-label="View"
        className={cn(
          'gen-shell-segmented inline-flex gap-0.5 rounded-md p-0.5',
          className,
        )}
        onValueChange={(value) => {
          if (value) {
            onChange(value as TView);
          }
        }}
        size={getToggleSize(size)}
        type="single"
        value={activeView}
      >
        {options.map((option) => (
          <Tooltip key={option.type}>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <ToggleGroupItem
                  aria-label={option.ariaLabel || option.label}
                  className="gen-shell-segmented-button size-7 min-w-7 rounded-[5px] p-0"
                  value={option.type}
                >
                  {option.icon}
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            <TooltipContent>{option.label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  );
}
