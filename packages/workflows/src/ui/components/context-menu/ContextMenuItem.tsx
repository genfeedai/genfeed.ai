'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import { ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { ContextMenuSeparator } from './ContextMenuSeparator';
import type { ContextMenuItemConfig } from './context-menu-config';

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
    [onClose],
  );

  const hasSubmenu = submenu && submenu.length > 0;

  return (
    <div
      ref={itemRef}
      className="relative"
      onPointerEnter={handleMouseEnter}
      onPointerLeave={handleMouseLeave}
    >
      <Button
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        onClick={hasSubmenu ? undefined : onClick}
        disabled={disabled}
        className={`
          w-full flex items-center gap-3 px-3 py-2 text-left text-sm h-auto justify-start
          ${isSelected || showSubmenu ? 'bg-secondary' : ''}
          ${danger && !disabled ? 'text-red-400 hover:text-red-300' : 'text-foreground'}
        `}
      >
        {icon && (
          <span
            className={`size-4 flex items-center justify-center ${danger ? 'text-red-400' : 'text-muted-foreground'}`}
          >
            {icon}
          </span>
        )}
        {label && <span className="flex-1">{label}</span>}
        {shortcut && !hasSubmenu && (
          <span className="text-xs text-muted-foreground ml-4">{shortcut}</span>
        )}
        {hasSubmenu && (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </Button>

      {/* Submenu */}
      {hasSubmenu && showSubmenu && (
        <div
          className="absolute left-full top-0 ml-1 min-w-[200px] py-1 bg-card border border-border shadow-lg backdrop-blur-sm z-50"
          onPointerEnter={handleMouseEnter}
          onPointerLeave={handleMouseLeave}
        >
          {submenu.map((item) => {
            if (item.separator) {
              return <ContextMenuSeparator key={item.id} />;
            }

            return (
              <Button
                withWrapper={false}
                key={item.id}
                variant={ButtonVariant.GHOST}
                onClick={() => handleSubmenuClick(item)}
                disabled={item.disabled}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 text-left text-sm h-auto justify-start
                  ${item.danger && !item.disabled ? 'text-red-400 hover:text-red-300' : 'text-foreground'}
                `}
              >
                {item.icon && (
                  <span
                    className={`size-4 flex items-center justify-center ${item.danger ? 'text-red-400' : 'text-muted-foreground'}`}
                  >
                    {item.icon}
                  </span>
                )}
                {item.label && <span className="flex-1">{item.label}</span>}
                {item.shortcut && (
                  <span className="text-xs text-muted-foreground ml-4">
                    {item.shortcut}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
