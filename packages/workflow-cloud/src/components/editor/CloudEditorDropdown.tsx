'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { HiOutlineChevronDown } from 'react-icons/hi2';

export interface CloudEditorDropdownItem {
  id: string;
  label?: string;
  icon?: ReactNode;
  onClick?: () => void;
  external?: boolean;
  separator?: boolean;
  disabled?: boolean;
}

interface CloudEditorDropdownProps {
  label: string;
  items: CloudEditorDropdownItem[];
}

export function CloudEditorDropdown({
  label,
  items,
}: CloudEditorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex items-center gap-1 rounded px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      >
        {label}
        <HiOutlineChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-lg whitespace-nowrap">
          {items.map((item) => {
            if (item.separator) {
              return <div key={item.id} className="my-1 h-px bg-border" />;
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.disabled || !item.onClick) return;
                  item.onClick();
                  setIsOpen(false);
                }}
                disabled={item.disabled}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span className="h-4 w-4 shrink-0">{item.icon}</span>
                <span>{item.label}</span>
                {item.external && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    ↗
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
