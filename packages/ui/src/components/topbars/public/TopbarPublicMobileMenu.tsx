'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { createPortal } from 'react-dom';

interface NavLink {
  href: string;
  label: string;
}

interface DropdownItem {
  href: string;
  label: string;
  description?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
}

interface Dropdown {
  label: string;
  items: DropdownItem[];
}

type TopbarPublicMobileMenuProps = {
  mounted: boolean;
  isMobileMenuOpen: boolean;
  dropdowns: Dropdown[];
  navLinks: NavLink[];
  pathname: string | null;
  onClose: () => void;
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

export default function TopbarPublicMobileMenu({
  mounted,
  isMobileMenuOpen,
  dropdowns,
  navLinks,
  pathname,
  onClose,
}: TopbarPublicMobileMenuProps): React.ReactElement | null {
  if (!mounted || !isMobileMenuOpen) {
    return null;
  }

  return createPortal(
    <div className="lg:hidden fixed inset-0 z-50">
      {/* Backdrop */}
      <Button
        type="button"
        variant={ButtonVariant.UNSTYLED}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        ariaLabel="Close menu"
      />

      {/* Menu Panel */}
      <div
        className="relative z-10 w-full max-h-[80vh] overflow-y-auto mt-20 border-b border-white/10"
        style={{ backgroundColor: '#09090b' }}
      >
        <nav className="container mx-auto p-6">
          <ul className="space-y-6">
            {/* Mobile Dropdowns */}
            {dropdowns.map((dropdown) => (
              <li key={dropdown.label}>
                <span className="block text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-3">
                  {dropdown.label}
                </span>
                <ul className="space-y-1">
                  {dropdown.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = isLinkActive(pathname, item.href);

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3 transition-colors',
                            isActive
                              ? 'bg-white/10 text-white'
                              : 'text-white/70 hover:bg-white/5 hover:text-white',
                          )}
                          onClick={onClose}
                        >
                          {Icon && <Icon className="size-5 text-white/50" />}
                          <span className="font-medium">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}

            {/* Mobile Flat Links */}
            {navLinks.length > 0 && (
              <li>
                <span className="block text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-3">
                  More
                </span>
                <ul className="space-y-1">
                  {navLinks.map((link) => {
                    const isActive = isLinkActive(pathname, link.href);

                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className={cn(
                            'block px-4 py-3 font-medium transition-colors',
                            isActive
                              ? 'bg-white/10 text-white'
                              : 'text-white/70 hover:bg-white/5 hover:text-white',
                          )}
                          onClick={onClose}
                        >
                          {link.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </div>,
    document.body,
  );
}
