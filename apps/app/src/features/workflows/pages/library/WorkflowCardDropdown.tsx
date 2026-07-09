'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { useEffect, useRef, useState } from 'react';
import {
  HiOutlineDocumentDuplicate,
  HiOutlineEllipsisVertical,
  HiOutlineTrash,
} from 'react-icons/hi2';

type WorkflowCardDropdownProps = {
  canDelete?: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
};

export default function WorkflowCardDropdown({
  canDelete = true,
  onDuplicate,
  onDelete,
}: WorkflowCardDropdownProps) {
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
        aria-label="Workflow actions"
        type="button"
        variant={ButtonVariant.UNSTYLED}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="rounded p-1 text-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
      >
        <HiOutlineEllipsisVertical className="size-4" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-7 z-20 min-w-[140px] rounded-lg bg-card py-1 shadow-dropdown">
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
            <HiOutlineDocumentDuplicate className="size-4" />
            Duplicate
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
              <HiOutlineTrash className="size-4" />
              Delete
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
