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

export interface TopbarPublicMegaMenuFooter {
  description: string;
  href: string;
  label: string;
}

type TopbarPublicDesktopDropdownProps = {
  mounted: boolean;
  openDropdown: string | null;
  currentDropdown: CurrentDropdown | undefined;
  dropdownPosition: DropdownPosition;
  megaMenuFooter?: TopbarPublicMegaMenuFooter;
  pathname: string | null;
  onMouseEnterDropdown: () => void;
  onMouseLeaveDropdown: () => void;
  onItemClick: () => void;
};

/** Height of the public top bar (`h-20`), which the mega panel sits directly under. */
const HEADER_HEIGHT_PX = 80;

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
  megaMenuFooter,
  pathname,
  onMouseEnterDropdown,
  onMouseLeaveDropdown,
  onItemClick,
}: TopbarPublicDesktopDropdownProps): React.ReactElement | null {
  if (!mounted || !openDropdown || !currentDropdown) {
    return null;
  }

  const hasGroups = currentDropdown.items.some((item) => Boolean(item.group));

  /**
   * A menu row, not a card.
   *
   * Every item used to be a bordered, filled tile sitting inside a bordered,
   * filled group panel — a card inside a card, which the design system bans and
   * which is most of why the menu read as unfinished. A row carries its own
   * hover fill and nothing else, so the eye follows the labels down the column
   * instead of counting boxes.
   */
  function renderItem(item: DropdownItem): React.ReactElement {
    const Icon = item.icon;
    const isActive = isLinkActive(pathname, item.href);

    return (
      <li key={item.href}>
        <Link
          className={cn(
            'group flex items-start gap-3 rounded-md px-3 py-3 transition-colors',
            isActive
              ? 'bg-foreground/[0.08] text-foreground'
              : 'text-foreground/90 hover:bg-foreground/[0.06] hover:text-foreground',
          )}
          href={item.href}
          onClick={onItemClick}
        >
          {Icon && (
            <Icon className="mt-0.5 size-4 shrink-0 text-foreground/50 transition-colors group-hover:text-foreground" />
          )}
          <span className="flex flex-col">
            <span className="text-sm font-semibold leading-5">
              {item.label}
            </span>
            {item.description && (
              <span className="mt-0.5 text-xs leading-5 text-foreground/55">
                {item.description}
              </span>
            )}
          </span>
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
        // The mega panel hangs off the bar itself, so it tracks the bar's real
        // height rather than a copy of it that drifts the day the bar changes.
        top: hasGroups ? HEADER_HEIGHT_PX : dropdownPosition.top - 8,
        zIndex: 50,
      }}
      onMouseEnter={onMouseEnterDropdown}
      onMouseLeave={onMouseLeaveDropdown}
    >
      {hasGroups ? (
        // One surface, one hairline under the header. The panel is the elevated
        // plane; nothing inside it is raised again.
        <div className="w-screen border-b border-edge/10 bg-popover shadow-dropdown">
          <div className="container mx-auto grid grid-cols-3 gap-x-10 px-6 py-8">
            {groupItems(currentDropdown.items).map(([groupLabel, items]) => (
              // `items-start` on the column, not `stretch`: groups hold
              // different numbers of links, and equal-height panels left the
              // shortest column as a tall empty box.
              <div className="min-w-0 self-start" key={groupLabel}>
                {groupLabel && (
                  <div className="px-3 pb-2 text-2xs font-bold uppercase tracking-[0.16em] text-foreground/45">
                    {groupLabel}
                  </div>
                )}
                <ul className="flex flex-col gap-0.5">
                  {items.map(renderItem)}
                </ul>
              </div>
            ))}
            {megaMenuFooter ? (
              <div className="col-span-3 mt-7 flex items-center justify-between border-t border-edge/10 px-3 pt-5">
                <p className="text-xs text-foreground/55">
                  {megaMenuFooter.description}
                </p>
                <Link
                  className="text-xs font-semibold text-foreground underline underline-offset-4"
                  href={megaMenuFooter.href}
                  onClick={onItemClick}
                >
                  {megaMenuFooter.label}
                </Link>
              </div>
            ) : null}
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
