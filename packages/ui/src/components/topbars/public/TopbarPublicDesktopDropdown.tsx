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
      <ul
        className="w-72 p-3 shadow-2xl border border-white/10"
        style={{ backgroundColor: '#09090b' }}
      >
        {currentDropdown.items.map((item) => {
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
                  <Icon className="size-5 flex-shrink-0 mt-0.5 text-white/60" />
                )}
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-white/50 mt-0.5">
                      {item.description}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}
