'use client';

import Image from 'next/image';
import type { KeyboardEvent } from 'react';
import { cn } from '../lib/utils';
import { Badge } from './badge';
import type { DropdownFieldOption } from './dropdown-field';

type BadgeVariant =
  | 'default'
  | 'destructive'
  | 'info'
  | 'outline'
  | 'secondary'
  | 'success'
  | 'warning';

type DropdownOptionItemProps = {
  option: DropdownFieldOption;
  value: string | number | undefined;
  index: number;
  getBadgeVariant: (
    variant: DropdownFieldOption['badgeVariant'],
  ) => BadgeVariant;
  onSelect: (key: string | number) => void;
};

export default function DropdownOptionItem({
  option,
  value,
  index,
  getBadgeVariant,
  onSelect,
}: DropdownOptionItemProps) {
  return (
    <button
      type="button"
      key={option.key != null ? String(option.key) : `option-${index}`}
      className={cn(
        'w-full px-3 py-2 text-left hover:bg-background transition-colors',
        value === option.key && 'bg-primary/20',
      )}
      onClick={() => onSelect(option.key)}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(option.key);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {option.thumbnailUrl && (
            <div className="size-10 flex-shrink-0 overflow-hidden bg-muted">
              <Image
                src={option.thumbnailUrl}
                alt={option.label}
                className="size-full object-cover"
                width={40}
                height={40}
                sizes="40px"
                priority={true}
              />
            </div>
          )}

          {option.icon && !option.thumbnailUrl && (
            <div className="flex-shrink-0 text-foreground/70">
              {option.icon}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="line-clamp-2 break-all text-sm font-medium">
              {option.label}
            </div>

            {option.description && (
              <div className="line-clamp-2 break-all text-xs text-foreground/60">
                {option.description}
              </div>
            )}
          </div>
        </div>
        {option.badge && (
          <Badge
            variant={getBadgeVariant(option.badgeVariant)}
            className="flex-shrink-0"
          >
            {option.badge}
          </Badge>
        )}
      </div>
    </button>
  );
}
