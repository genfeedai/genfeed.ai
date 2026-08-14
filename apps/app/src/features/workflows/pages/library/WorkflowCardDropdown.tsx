'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { CalendarClock, Copy, EllipsisVertical, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

type WorkflowCardDropdownProps = {
  canDelete?: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Present only for workflows whose schedule the caller may edit. */
  onSchedule?: () => void;
};

export default function WorkflowCardDropdown({
  canDelete = true,
  onDuplicate,
  onDelete,
  onSchedule,
}: WorkflowCardDropdownProps) {
  const translate = useTranslations('common.automation.workflows.actions');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative">
      <Button
        aria-label={translate('menu')}
        type="button"
        variant={ButtonVariant.UNSTYLED}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="rounded p-1 text-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
      >
        <EllipsisVertical className="size-4" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-7 z-20 min-w-[140px] rounded-lg bg-card py-1 shadow-dropdown">
          {onSchedule ? (
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSchedule();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <CalendarClock className="size-4" />
              {translate('schedule')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDuplicate();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Copy className="size-4" />
            {translate('duplicate')}
          </Button>
          {canDelete ? (
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-muted"
            >
              <Trash2 className="size-4" />
              {translate('delete')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
