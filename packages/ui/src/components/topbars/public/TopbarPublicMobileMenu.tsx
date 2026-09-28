'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { createPortal } from 'react-dom';

import type { TopbarPublicMegaMenuFooter } from './TopbarPublicDesktopDropdown';

interface NavLink {
  href: string;
  label: string;
}

interface DropdownItem {
  href: string;
  label: string;
  description?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  group?: string;
}

interface Dropdown {
  label: string;
  items: DropdownItem[];
  footer?: TopbarPublicMegaMenuFooter;
}

type TopbarPublicMobileMenuProps = {
  id: string;
  mounted: boolean;
  isMobileMenuOpen: boolean;
  dropdowns: Dropdown[];
  navLinks: NavLink[];
  /** Account actions (log in, open the app, connect an agent) for small screens. */
  actions?: ReactNode;
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

const ROW_CLASS = 'flex min-h-12 items-center gap-3 px-4 transition-colors';

function rowStateClass(isActive: boolean): string {
  return isActive
    ? 'bg-foreground/10 text-foreground'
    : 'text-foreground/70 hover:bg-foreground/5 hover:text-foreground';
}

export default function TopbarPublicMobileMenu({
  id,
  mounted,
  isMobileMenuOpen,
  dropdowns,
  navLinks,
  actions,
  pathname,
  onClose,
}: TopbarPublicMobileMenuProps): React.ReactElement | null {
  if (!mounted || !isMobileMenuOpen) {
    return null;
  }

  return createPortal(
    // One layer below the header (`z-50`): the scrim dims the page, not the
    // bar, so the close button and the header CTA stay visible and tappable.
    <div className="lg:hidden fixed inset-0 z-40">
      {/* Backdrop */}
      <Button
        type="button"
        variant={ButtonVariant.UNSTYLED}
        className={
          'absolute inset-0 bg-black/80 backdrop-blur-sm' /* design-system-allow-content-color -- navigation scrim */
        }
        onClick={onClose}
        ariaLabel="Close menu"
      />

      {/* Menu Panel */}
      <div
        className="relative z-10 mt-20 max-h-[calc(100dvh-5rem)] w-full overflow-y-auto overscroll-contain border-b border-border bg-background"
        id={id}
      >
        <nav aria-label="Main" className="container mx-auto p-6">
          {actions ? <div className="mb-6">{actions}</div> : null}

          <ul className="space-y-6">
            {/*
              The flat links (Pricing, Blog) lead: they are the destinations a
              visitor on a phone asks for first, and under the groups they sat
              seventeen rows down.
            */}
            {navLinks.length > 0 && (
              <li>
                <ul className="space-y-1">
                  {navLinks.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={cn(
                          ROW_CLASS,
                          'font-semibold',
                          rowStateClass(isLinkActive(pathname, link.href)),
                        )}
                        onClick={onClose}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            )}

            {dropdowns.map((dropdown) => (
              <li key={dropdown.label}>
                <span className="mb-2 block px-4 text-xs font-bold uppercase tracking-[0.16em] text-foreground/60">
                  {dropdown.label}
                </span>
                <ul className="space-y-1">
                  {dropdown.items.map((item) => {
                    const Icon = item.icon;

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            ROW_CLASS,
                            rowStateClass(isLinkActive(pathname, item.href)),
                          )}
                          onClick={onClose}
                        >
                          {Icon && (
                            <Icon className="size-5 text-foreground/50" />
                          )}
                          <span className="font-medium">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}

                  {dropdown.footer && (
                    <li>
                      <Link
                        href={dropdown.footer.href}
                        className={cn(
                          ROW_CLASS,
                          'text-sm font-semibold',
                          rowStateClass(false),
                        )}
                        onClick={onClose}
                      >
                        {dropdown.footer.label}
                        <ArrowRight className="size-4" />
                      </Link>
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>,
    document.body,
  );
}
