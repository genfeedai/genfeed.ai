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
            'group flex min-h-20 items-start gap-3 rounded-lg border px-4 py-3.5 transition-[background-color,border-color,color]',
            isActive
              ? 'border-foreground/20 bg-foreground/[0.1] text-foreground'
              : 'border-edge/10 bg-foreground/[0.025] text-foreground/90 hover:border-foreground/15 hover:bg-foreground/[0.07] hover:text-foreground',
          )}
          onClick={onItemClick}
        >
          {Icon && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-edge/15 bg-background/85">
              <Icon className="size-4 text-foreground/75 transition-colors group-hover:text-foreground" />
            </span>
          )}
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{item.label}</span>
            {item.description && (
              <span className="mt-1 text-xs leading-5 text-foreground/60">
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
        left: hasGroups ? 0 : dropdownPosition.left,
        paddingTop: hasGroups ? 0 : 8,
        top: hasGroups ? 80 : dropdownPosition.top - 8,
        zIndex: 50,
      }}
      onMouseEnter={onMouseEnterDropdown}
      onMouseLeave={onMouseLeaveDropdown}
    >
      {hasGroups ? (
        <div className="w-screen border-y border-edge/15 bg-[#0d0d0e]/98 shadow-[0_28px_80px_rgba(0,0,0,0.46)] backdrop-blur-2xl">
          <div className="container mx-auto grid grid-cols-3 gap-7 px-6 py-6">
            {groupItems(currentDropdown.items).map(([groupLabel, items]) => (
              <div
                className="min-w-0 rounded-xl border border-edge/10 bg-foreground/[0.018] p-2"
                key={groupLabel}
              >
                {groupLabel && (
                  <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/55">
                    {groupLabel}
                  </div>
                )}
                <ul>{items.map(renderItem)}</ul>
              </div>
            ))}
            <div className="col-span-3 flex items-center justify-between border-t border-edge/15 px-4 pt-5">
              <p className="text-xs text-foreground/55">
                One content system from first brief to verified result.
              </p>
              <Link
                className="text-xs font-semibold text-foreground underline underline-offset-4"
                href="/features"
                onClick={onItemClick}
              >
                Explore every capability
              </Link>
            </div>
          </div>
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
