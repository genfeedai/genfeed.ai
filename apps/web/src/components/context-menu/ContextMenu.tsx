'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ContextMenuItem } from './ContextMenuItem';
import { ContextMenuSeparator } from './ContextMenuSeparator';

export interface ContextMenuItemConfig {
  id: string;
  label?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItemConfig[];
  onClick?: () => void;
}

/** Helper to create a separator item */
export function createSeparator(id: string): ContextMenuItemConfig {
  return { id, separator: true };
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItemConfig[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [position, setPosition] = useState({ x, y });

  // Calculate position to keep menu on screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const padding = 8;

      let newX = x;
      let newY = y;

      // Check right edge
      if (x + rect.width + padding > window.innerWidth) {
        newX = x - rect.width;
      }

      // Check bottom edge
      if (y + rect.height + padding > window.innerHeight) {
        newY = y - rect.height;
      }

      // Ensure not off left/top
      newX = Math.max(padding, newX);
      newY = Math.max(padding, newY);

      setPosition({ x: newX, y: newY });
    }
  }, [x, y]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Delay to avoid immediate close from the same click that opened the menu
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const selectableIndices = items
        .map((item, index) => (!item.separator && !item.disabled ? index : -1))
        .filter((index) => index !== -1);

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          event.preventDefault();
          if (selectableIndices.length > 0) {
            const currentSelectableIndex = selectableIndices.indexOf(selectedIndex);
            const nextIndex =
              currentSelectableIndex === -1
                ? 0
                : (currentSelectableIndex + 1) % selectableIndices.length;
            setSelectedIndex(selectableIndices[nextIndex]);
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (selectableIndices.length > 0) {
            const currentSelectableIndex = selectableIndices.indexOf(selectedIndex);
            const prevIndex =
              currentSelectableIndex === -1
                ? selectableIndices.length - 1
                : (currentSelectableIndex - 1 + selectableIndices.length) %
                  selectableIndices.length;
            setSelectedIndex(selectableIndices[prevIndex]);
          }
          break;
        case 'Enter':
          event.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < items.length) {
            const item = items[selectedIndex];
            if (!item.separator && !item.disabled && item.onClick) {
              item.onClick();
              onClose();
            }
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onClose]);

  const handleItemClick = useCallback(
    (item: ContextMenuItemConfig) => {
      if (!item.disabled && item.onClick) {
        item.onClick();
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] py-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg backdrop-blur-sm"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <ContextMenuSeparator key={item.id} />;
        }

        return (
          <ContextMenuItem
            key={item.id}
            id={item.id}
            label={item.label}
            icon={item.icon}
            shortcut={item.shortcut}
            disabled={item.disabled}
            danger={item.danger}
            submenu={item.submenu}
            onClick={() => handleItemClick(item)}
            onClose={onClose}
            isSelected={index === selectedIndex}
          />
        );
      })}
    </div>
  );
}
