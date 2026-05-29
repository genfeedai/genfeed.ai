'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';

import { Button } from '@ui/primitives/button';

import { useCallback, useEffect, useState } from 'react';
import { HiChevronDown } from 'react-icons/hi2';

const COLLAPSED_GROUPS_KEY = 'genfeed:sidebar:collapsed';

function getCollapsedGroups(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }
  try {
    const stored = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function persistCollapsedGroups(groups: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...groups]));
  } catch {
    // Silently ignore localStorage errors
  }
}

/** Collapsible group with label header and toggle */
export default function CollapsibleGroup({
  label,
  isDrillDown,
  children,
  storageKey,
  actions,
  className,
  contentClassName,
  headerClassName,
  onCollapsedChange,
}: {
  label: string;
  isDrillDown: boolean;
  children: React.ReactNode;
  storageKey?: string;
  actions?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
  onCollapsedChange?: (isCollapsed: boolean) => void;
}) {
  const key = storageKey ?? label;
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const collapsed = getCollapsedGroups().has(key);
    if (collapsed) {
      setIsCollapsed(true);
    }
  }, [key]);

  const toggleMenuShared = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      const groups = getCollapsedGroups();
      if (next) {
        groups.add(key);
      } else {
        groups.delete(key);
      }
      persistCollapsedGroups(groups);
      onCollapsedChange?.(next);
      return next;
    });
  }, [key, onCollapsedChange]);

  // DrillDown groups render their own row — no separate label needed
  if (isDrillDown) {
    return <div className={cn('mt-1', className)}>{children}</div>;
  }

  // Ungrouped items (empty label) render flat without a collapsible header
  if (!label) {
    return <div className={cn('mt-1', className)}>{children}</div>;
  }

  return (
    <div className={cn('mt-2', className)}>
      <div
        className={cn(
          'group/collapsible flex w-full items-center p-1 text-white/30',
          headerClassName,
        )}
      >
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={toggleMenuShared}
          className="flex items-center gap-1.5 hover:text-white/50 transition-colors duration-150 cursor-pointer"
        >
          <HiChevronDown
            className={cn(
              'size-3 transition-transform duration-200',
              isCollapsed && '-rotate-90',
            )}
          />
          <span className="text-[10px] font-bold uppercase tracking-[0.15em]">
            {label}
          </span>
        </Button>
        {actions && !isCollapsed && <div className="ml-auto">{actions}</div>}
      </div>
      {!isCollapsed && <div className={contentClassName}>{children}</div>}
    </div>
  );
}
