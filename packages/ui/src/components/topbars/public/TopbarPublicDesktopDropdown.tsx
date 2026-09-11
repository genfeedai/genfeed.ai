'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { useEffect, useState } from 'react';
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

/** Keep in lockstep with the Product/Use Cases/Solutions chevron. */
export const TOPBAR_MENU_MOTION_MS = 300;

type RenderedPanel = {
  dropdown: CurrentDropdown;
  footer?: TopbarPublicMegaMenuFooter;
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
  megaMenuFooter,
  pathname,
  onMouseEnterDropdown,
  onMouseLeaveDropdown,
  onItemClick,
}: TopbarPublicDesktopDropdownProps): React.ReactElement | null {
  const isExpanded = Boolean(openDropdown && currentDropdown);
  const [lastPanel, setLastPanel] = useState<RenderedPanel | undefined>();

  useEffect(() => {
    if (currentDropdown) {
      setLastPanel({ dropdown: currentDropdown, footer: megaMenuFooter });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLastPanel(undefined);
    }, TOPBAR_MENU_MOTION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [currentDropdown, megaMenuFooter]);

  const panel: RenderedPanel | undefined = currentDropdown
    ? { dropdown: currentDropdown, footer: megaMenuFooter }
    : lastPanel;

  if (!mounted || !panel) {
    return null;
  }

  const hasGroups = panel.dropdown.items.some((item) => Boolean(item.group));

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

  const groupedBody = (
    <div className="container mx-auto grid grid-cols-3 gap-x-10 px-6 py-8">
      {groupItems(panel.dropdown.items).map(([groupLabel, items]) => (
        // `items-start` on the column, not `stretch`: groups hold
        // different numbers of links, and equal-height panels left the
        // shortest column as a tall empty box.
        <div className="min-w-0 self-start" key={groupLabel}>
          {groupLabel && (
            <div className="px-3 pb-2 text-2xs font-bold uppercase tracking-[0.16em] text-foreground/45">
              {groupLabel}
            </div>
          )}
          <ul className="flex flex-col gap-0.5">{items.map(renderItem)}</ul>
        </div>
      ))}
      {panel.footer ? (
        <div className="col-span-3 mt-7 flex items-center justify-between border-t border-edge/10 px-3 pt-5">
          <p className="text-xs text-foreground/55">
            {panel.footer.description}
          </p>
          <Link
            className="text-xs font-semibold text-foreground underline underline-offset-4"
            href={panel.footer.href}
            onClick={onItemClick}
          >
            {panel.footer.label}
          </Link>
        </div>
      ) : null}
    </div>
  );

  if (hasGroups) {
    return (
      <div
        aria-hidden={!isExpanded}
        className={cn(
          'hidden lg:grid transition-[grid-template-rows,opacity] duration-300 ease-out starting:grid-rows-[0fr] starting:opacity-0',
          isExpanded
            ? 'grid-rows-[1fr] opacity-100'
            : 'pointer-events-none grid-rows-[0fr] opacity-0',
        )}
        {...(!isExpanded ? { inert: true } : {})}
        onMouseEnter={onMouseEnterDropdown}
        onMouseLeave={onMouseLeaveDropdown}
      >
        <div className="min-h-0 overflow-hidden">{groupedBody}</div>
      </div>
    );
  }

  // The panel outlives `openDropdown` by one motion cycle so it can fade out.
  // The portal has to carry the same closed state as the grouped branch, or an
  // ungrouped menu stays fully visible and clickable for those 300ms.
  return createPortal(
    <div
      aria-hidden={!isExpanded}
      className={cn(
        'fixed hidden transition-opacity duration-300 ease-out lg:block',
        isExpanded ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{
        isolation: 'isolate',
        left: dropdownPosition.left,
        paddingTop: 8,
        top: dropdownPosition.top - 8,
        zIndex: 50,
      }}
      {...(!isExpanded ? { inert: true } : {})}
      onMouseEnter={onMouseEnterDropdown}
      onMouseLeave={onMouseLeaveDropdown}
    >
      <ul className="w-72 bg-popover p-3 shadow-dropdown">
        {panel.dropdown.items.map(renderItem)}
      </ul>
    </div>,
    document.body,
  );
}
