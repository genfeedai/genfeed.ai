'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Hash } from 'lucide-react';
import type { RefObject } from 'react';

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
    <Badge
      className="absolute -top-0.5 -right-0.5 z-10"
      isSolid
      shape="pill"
      value={selectedTagCount}
    />
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
      <Hash className="size-4" />
      {buttonContent}
    </Button>
  );
}
