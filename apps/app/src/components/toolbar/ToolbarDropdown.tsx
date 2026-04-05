'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ToolbarDropdownProps } from './types';

/**
 * Toolbar dropdown menu component
 */
export function ToolbarDropdown({ label, items }: ToolbarDropdownProps) {
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
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
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
                onClick={() => {
                  if (item.disabled || !item.onClick) return;
                  item.onClick();
                  setIsOpen(false);
                }}
                disabled={item.disabled}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <span className="h-4 w-4 shrink-0">{item.icon}</span>
                <span>{item.label}</span>
                {item.external && <span className="ml-auto text-xs text-muted-foreground">↗</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
