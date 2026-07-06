'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import type { RefObject } from 'react';
import { HiHashtag } from 'react-icons/hi2';

type DropdownTagsTriggerProps = {
  buttonRef: RefObject<HTMLButtonElement | null>;
  isDisabled: boolean;
  hasSelectedTags: boolean;
  showLabel: boolean;
  tagCountLabel: string;
  selectedTagCount: number;
  className?: string;
  onToggle: () => void;
};

export default function DropdownTagsTrigger({
  buttonRef,
  isDisabled,
  hasSelectedTags,
  showLabel,
  tagCountLabel,
  selectedTagCount,
  className,
  onToggle,
}: DropdownTagsTriggerProps) {
  const buttonContent: React.ReactNode = showLabel ? (
    <span>{tagCountLabel}</span>
  ) : hasSelectedTags ? (
    <span className="absolute -top-0.5 -right-0.5 min-w-fit h-5 flex items-center justify-center px-1 text-[10px] font-bold text-primary-foreground bg-primary rounded-full border-2 border-white/20 shadow-lg z-10">
      {selectedTagCount}
    </span>
  ) : null;

  return (
    <Button
      ref={buttonRef}
      withWrapper={false}
      variant={ButtonVariant.UNSTYLED}
      onClick={onToggle}
      isDisabled={isDisabled}
      tooltip="Tags"
      tooltipPosition="top"
      ariaLabel="Manage tags"
      className={cn(
        'h-8 rounded-lg px-2 hover:bg-accent normal-case flex items-center gap-2 hover:bg-background',
        hasSelectedTags ? 'text-foreground' : 'text-foreground/70',
        className,
        isDisabled && 'opacity-50 cursor-not-allowed',
        !showLabel && hasSelectedTags && 'relative',
      )}
    >
      <HiHashtag className="size-4" />
      {buttonContent}
    </Button>
  );
}
