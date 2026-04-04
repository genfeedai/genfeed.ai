'use client';

import type { ActionConfig, MenuAlign, MenuSide } from '@genfeedai/types';
import { clsx } from 'clsx';
import { MoreVertical } from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

interface ActionMenuProps {
  actions: ActionConfig<ReactNode>[];
  triggerIcon?: ReactNode;
  triggerLabel?: string;
  align?: MenuAlign;
  side?: MenuSide;
  className?: string;
}

const ALIGN_CLASSES: Record<MenuAlign, string> = {
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
  start: 'left-0',
};

const SIDE_CLASSES: Record<MenuSide, string> = {
  bottom: 'top-full mt-1',
  left: 'right-full mr-1 top-0',
  right: 'left-full ml-1 top-0',
  top: 'bottom-full mb-1',
};

function ActionMenuComponent({
  actions,
  triggerIcon,
  triggerLabel,
  align = 'end',
  side = 'bottom',
  className,
}: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const visibleActions = actions.filter((action) => !action.hidden);

  // Close on click outside
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

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const selectableIndices = visibleActions
        .map((_, index) => index)
        .filter((index) => !visibleActions[index].disabled);

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
          break;
        case 'ArrowDown':
          event.preventDefault();
          if (selectableIndices.length > 0) {
            const currentIdx = selectableIndices.indexOf(selectedIndex);
            const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % selectableIndices.length;
            setSelectedIndex(selectableIndices[nextIdx]);
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (selectableIndices.length > 0) {
            const currentIdx = selectableIndices.indexOf(selectedIndex);
            const prevIdx =
              currentIdx === -1
                ? selectableIndices.length - 1
                : (currentIdx - 1 + selectableIndices.length) % selectableIndices.length;
            setSelectedIndex(selectableIndices[prevIdx]);
          }
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (selectedIndex >= 0 && !visibleActions[selectedIndex].disabled) {
            visibleActions[selectedIndex].onClick();
            setIsOpen(false);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, visibleActions]);

  const handleItemClick = useCallback((action: ActionConfig<ReactNode>) => {
    if (!action.disabled) {
      action.onClick();
      setIsOpen(false);
    }
  }, []);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
    setSelectedIndex(-1);
  };

  if (visibleActions.length === 0) return null;

  return (
    <div ref={menuRef} className={clsx('relative', className)}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={clsx(
          'p-1 rounded transition-colors',
          'hover:bg-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
          isOpen && 'bg-[var(--border)]'
        )}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={triggerLabel || 'Open menu'}
      >
        {triggerIcon || <MoreVertical className="w-4 h-4" />}
      </button>

      {/* Menu Dropdown */}
      {isOpen && (
        <div
          className={clsx(
            'absolute z-50 min-w-[160px] py-1',
            'bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg',
            ALIGN_CLASSES[align],
            SIDE_CLASSES[side]
          )}
          role="menu"
        >
          {visibleActions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleItemClick(action)}
              disabled={action.disabled}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left',
                'transition-colors',
                action.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-[var(--foreground)] hover:bg-[var(--border)]',
                action.disabled && 'opacity-50 cursor-not-allowed',
                index === selectedIndex && 'bg-[var(--border)]'
              )}
              role="menuitem"
              tabIndex={-1}
            >
              {action.icon && <span className="w-4 h-4 shrink-0">{action.icon}</span>}
              <span className="flex-1">{action.label}</span>
              {action.shortcut && (
                <span className="text-xs text-[var(--muted-foreground)]">{action.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const ActionMenu = memo(ActionMenuComponent);
