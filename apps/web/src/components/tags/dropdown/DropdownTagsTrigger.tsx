'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
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
      variant={ButtonVariant.GHOST}
      size={ButtonSize.SM}
      onClick={onToggle}
      isDisabled={isDisabled}
      tooltip="Tags"
      tooltipPosition="top"
      ariaLabel="Manage tags"
      className={cn(!showLabel && hasSelectedTags && 'relative', className)}
    >
      <Hash className="size-4" />
      {buttonContent}
    </Button>
  );
}
