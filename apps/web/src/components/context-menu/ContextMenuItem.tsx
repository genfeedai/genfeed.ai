'use client';

import { ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import type { ContextMenuItemConfig } from './ContextMenu';
import { ContextMenuSeparator } from './ContextMenuSeparator';

export interface ContextMenuItemProps {
  id: string;
  label?: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  submenu?: ContextMenuItemConfig[];
  onClick: () => void;
  onClose?: () => void;
  isSelected?: boolean;
}

export function ContextMenuItem({
  label,
  icon,
  shortcut,
  disabled,
  danger,
  submenu,
  onClick,
  onClose,
  isSelected,
}: ContextMenuItemProps) {
  const [showSubmenu, setShowSubmenu] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (submenu && !disabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setShowSubmenu(true);
    }
  }, [submenu, disabled]);

  const handleMouseLeave = useCallback(() => {
    if (submenu) {
      timeoutRef.current = setTimeout(() => {
        setShowSubmenu(false);
      }, 100);
    }
  }, [submenu]);

  const handleSubmenuClick = useCallback(
    (item: ContextMenuItemConfig) => {
      if (!item.disabled && item.onClick) {
        item.onClick();
        onClose?.();
      }
    },
    [onClose]
  );

  const hasSubmenu = submenu && submenu.length > 0;

  return (
    <div
      ref={itemRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={hasSubmenu ? undefined : onClick}
        disabled={disabled}
        className={`
          w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-md
          transition-colors outline-none
          ${isSelected || showSubmenu ? 'bg-[var(--secondary)]' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--secondary)] cursor-pointer'}
          ${danger && !disabled ? 'text-red-400 hover:text-red-300' : 'text-[var(--foreground)]'}
        `}
      >
        {icon && (
          <span
            className={`w-4 h-4 flex items-center justify-center ${danger ? 'text-red-400' : 'text-[var(--muted-foreground)]'}`}
          >
            {icon}
          </span>
        )}
        {label && <span className="flex-1">{label}</span>}
        {shortcut && !hasSubmenu && (
          <span className="text-xs text-[var(--muted-foreground)] ml-4">{shortcut}</span>
        )}
        {hasSubmenu && <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />}
      </button>

      {/* Submenu */}
      {hasSubmenu && showSubmenu && (
        <div
          className="absolute left-full top-0 ml-1 min-w-[200px] py-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg backdrop-blur-sm z-50"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {submenu.map((item) => {
            if (item.separator) {
              return <ContextMenuSeparator key={item.id} />;
            }

            return (
              <button
                key={item.id}
                onClick={() => handleSubmenuClick(item)}
                disabled={item.disabled}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-md
                  transition-colors outline-none
                  ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--secondary)] cursor-pointer'}
                  ${item.danger && !item.disabled ? 'text-red-400 hover:text-red-300' : 'text-[var(--foreground)]'}
                `}
              >
                {item.icon && (
                  <span
                    className={`w-4 h-4 flex items-center justify-center ${item.danger ? 'text-red-400' : 'text-[var(--muted-foreground)]'}`}
                  >
                    {item.icon}
                  </span>
                )}
                {item.label && <span className="flex-1">{item.label}</span>}
                {item.shortcut && (
                  <span className="text-xs text-[var(--muted-foreground)] ml-4">
                    {item.shortcut}
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
