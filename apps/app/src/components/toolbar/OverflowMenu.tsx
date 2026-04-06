'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { OverflowMenuProps } from './types';

/**
 * Overflow menu with icon trigger
 */
export function OverflowMenu({ items }: OverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            onClick={() => setIsOpen(!isOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            icon={<MoreVertical className="h-4 w-4" />}
          />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>More options</p>
        </TooltipContent>
      </Tooltip>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-lg">
          {items.map((item) => (
            <Button
              key={item.id}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => {
                item.onClick?.();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-secondary rounded-none justify-start"
            >
              <span className="h-4 w-4 shrink-0">{item.icon}</span>
              <span>{item.label}</span>
              {item.external && (
                <span className="ml-auto text-xs text-muted-foreground">↗</span>
              )}
</Button>
          ))}
        </div>
      )}
    </div>
  );
}
