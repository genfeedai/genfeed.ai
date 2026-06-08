'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { HiCheck } from 'react-icons/hi2';
import { Avatar } from './Avatar';

type SectionRowProps = {
  label: string;
  imageUrl?: string | null;
  isActive?: boolean;
  onSelect: () => void;
  testId?: string;
  isDisabled?: boolean;
};

export function SectionRow({
  label,
  imageUrl,
  isActive,
  onSelect,
  testId,
  isDisabled,
}: SectionRowProps) {
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      data-testid={testId}
      onClick={() => !isActive && onSelect()}
      isDisabled={isActive || isDisabled}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors duration-150',
        isActive
          ? 'text-foreground cursor-default'
          : 'text-foreground/70 hover:text-foreground hover:bg-foreground/[0.06] cursor-pointer',
      )}
    >
      <Avatar label={label} imageUrl={imageUrl} isActive={isActive} />
      <span className="flex-1 truncate text-left">{label}</span>
      {isActive && <HiCheck className="size-3.5 text-primary flex-shrink-0" />}
    </Button>
  );
}
