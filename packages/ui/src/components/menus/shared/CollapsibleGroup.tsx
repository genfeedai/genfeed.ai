'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';

import { Button } from '@ui/primitives/button';

import { useCallback, useSyncExternalStore } from 'react';
import { HiChevronDown } from 'react-icons/hi2';

const COLLAPSED_GROUPS_KEY = 'genfeed:sidebar:collapsed';
const COLLAPSED_GROUPS_CHANGED_EVENT = 'genfeed:sidebar:collapsed-changed';

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
    window.dispatchEvent(new Event(COLLAPSED_GROUPS_CHANGED_EVENT));
  } catch {
    // Silently ignore localStorage errors
  }
}

function subscribeCollapsedGroups(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleLocalChange = () => onStoreChange();
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === COLLAPSED_GROUPS_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener(COLLAPSED_GROUPS_CHANGED_EVENT, handleLocalChange);
  window.addEventListener('storage', handleStorageChange);

  return () => {
    window.removeEventListener(
      COLLAPSED_GROUPS_CHANGED_EVENT,
      handleLocalChange,
    );
    window.removeEventListener('storage', handleStorageChange);
  };
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
  const isCollapsed = useSyncExternalStore(
    subscribeCollapsedGroups,
    () => getCollapsedGroups().has(key),
    () => false,
  );

  const toggleMenuShared = useCallback(() => {
    const next = !isCollapsed;
    const groups = getCollapsedGroups();
    if (next) {
      groups.add(key);
    } else {
      groups.delete(key);
    }
    persistCollapsedGroups(groups);
    onCollapsedChange?.(next);
  }, [isCollapsed, key, onCollapsedChange]);

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
          'group/collapsible flex w-full items-center p-1 text-foreground/30',
          headerClassName,
        )}
      >
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={toggleMenuShared}
          className="flex items-center gap-1.5 hover:text-foreground/50 transition-colors duration-150 cursor-pointer"
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
