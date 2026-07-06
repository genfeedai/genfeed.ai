'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { createPortal } from 'react-dom';

interface DropdownItem {
  href: string;
  label: string;
  description?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  /** Optional section label; when present, items render as a grouped mega menu. */
  group?: string;
}

interface CurrentDropdown {
  label: string;
  items: DropdownItem[];
}

interface DropdownPosition {
  top: number;
  left: number;
}

type TopbarPublicDesktopDropdownProps = {
  mounted: boolean;
  openDropdown: string | null;
  currentDropdown: CurrentDropdown | undefined;
  dropdownPosition: DropdownPosition;
  pathname: string | null;
  onMouseEnterDropdown: () => void;
  onMouseLeaveDropdown: () => void;
  onItemClick: () => void;
};

function isLinkActive(pathname: string | null, href: string): boolean {
  if (!pathname) {
    return false;
  }
  if (href === '/') {
    return pathname === '/';
  }

  return pathname.startsWith(href);
}

function groupItems(items: DropdownItem[]): [string, DropdownItem[]][] {
  const order: string[] = [];
  const byGroup = new Map<string, DropdownItem[]>();

  for (const item of items) {
    const key = item.group ?? '';
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)?.push(item);
  }

  return order.map((key) => [key, byGroup.get(key) ?? []]);
}

export default function TopbarPublicDesktopDropdown({
  mounted,
  openDropdown,
  currentDropdown,
  dropdownPosition,
  pathname,
  onMouseEnterDropdown,
  onMouseLeaveDropdown,
  onItemClick,
}: TopbarPublicDesktopDropdownProps): React.ReactElement | null {
  if (!mounted || !openDropdown || !currentDropdown) {
    return null;
  }

  const hasGroups = currentDropdown.items.some((item) => Boolean(item.group));

  function renderItem(item: DropdownItem): React.ReactElement {
    const Icon = item.icon;
    const isActive = isLinkActive(pathname, item.href);

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={cn(
            'flex items-start gap-3 px-4 py-3 transition-colors',
            isActive
              ? 'bg-white/10 text-white'
              : 'text-white/80 hover:bg-white/5 hover:text-white',
          )}
          onClick={onItemClick}
        >
          {Icon && (
            <Icon className="size-5 flex-shrink-0 mt-0.5 text-white/70" />
          )}
          <div className="flex flex-col">
            <span className="font-medium text-sm">{item.label}</span>
            {item.description && (
              <span className="text-xs text-white/55 mt-0.5">
                {item.description}
              </span>
            )}
          </div>
        </Link>
      </li>
    );
  }

  return createPortal(
    <div
      className="fixed hidden lg:block"
      style={{
        isolation: 'isolate',
        left: dropdownPosition.left,
        paddingTop: 8,
        top: dropdownPosition.top - 8,
        zIndex: 50,
      }}
      onMouseEnter={onMouseEnterDropdown}
      onMouseLeave={onMouseLeaveDropdown}
    >
      {hasGroups ? (
        <div className="grid w-[600px] grid-cols-2 gap-2 bg-popover p-3 shadow-dropdown">
          {groupItems(currentDropdown.items).map(([groupLabel, items]) => (
            <div key={groupLabel}>
              {groupLabel && (
                <div className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                  {groupLabel}
                </div>
              )}
              <ul>{items.map(renderItem)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="w-72 bg-popover p-3 shadow-dropdown">
          {currentDropdown.items.map(renderItem)}
        </ul>
      )}
    </div>,
    document.body,
  );
}
