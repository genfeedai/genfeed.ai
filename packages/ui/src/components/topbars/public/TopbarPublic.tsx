'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import Button from '@ui/buttons/base/Button';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiBars3, HiChevronDown, HiXMark } from 'react-icons/hi2';

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

interface TopbarPublicProps {
  navLinks?: NavLink[];
  dropdowns?: Dropdown[];
  rightContent?: ReactNode;
  megaMenu?: boolean;
}

interface DropdownPosition {
  top: number;
  left: number;
}

function isLinkActive(pathname: string | null, href: string): boolean {
  if (!pathname) {
    return false;
  }
  if (href === '/') {
    return pathname === '/';
  }

  return pathname.startsWith(href);
}

export default function TopbarPublic({
  navLinks = [],
  dropdowns = [],
  rightContent,
  megaMenu = false,
}: TopbarPublicProps): React.ReactElement {
  const pathname = usePathname();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({
    left: 0,
    top: 0,
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const _megaMenuRef = useRef<HTMLDivElement>(null);

  // Handle hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setOpenDropdown(null);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const handleDropdownOpen = useCallback(
    (label: string) => {
      if (megaMenu && dropdowns.length > 0) {
        // For mega-menu, position based on first dropdown trigger
        const firstTrigger = triggerRefs.current.get(dropdowns[0].label);
        if (firstTrigger) {
          const rect = firstTrigger.getBoundingClientRect();
          setDropdownPosition({
            left: rect.left,
            top: rect.bottom,
          });
        }
        setOpenDropdown('mega');
      } else {
        const trigger = triggerRefs.current.get(label);
        if (trigger) {
          const rect = trigger.getBoundingClientRect();
          setDropdownPosition({
            left: rect.left,
            top: rect.bottom + 8,
          });
        }
        setOpenDropdown(label);
      }
    },
    [megaMenu, dropdowns],
  );

  const handleDropdownClose = useCallback(() => {
    setOpenDropdown(null);
  }, []);

  // Get the current open dropdown data
  const currentDropdown = dropdowns.find((d) => d.label === openDropdown);

  return (
    <>
      <header
        className="fixed inset-x-0 top-0 z-50 w-full border-b border-white/10"
        style={{
          backdropFilter: 'blur(24px)',
          backgroundColor: 'rgba(9, 9, 11, 0.6)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="container mx-auto flex items-center justify-between h-20 px-6">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-12">
            <TopbarLogo logoHref="/" />

            {/* Desktop Navigation */}
            <nav className="hidden lg:block">
              <ul className="flex items-center gap-8">
                {/* Dropdowns */}
                {dropdowns.map((dropdown) => {
                  const isOpen = openDropdown === dropdown.label;
                  const isAnyActive = dropdown.items.some((item) =>
                    isLinkActive(pathname, item.href),
                  );

                  return (
                    <li
                      key={dropdown.label}
                      onMouseEnter={() => handleDropdownOpen(dropdown.label)}
                      onMouseLeave={handleDropdownClose}
                    >
                      <Button
                        ref={(el) => {
                          if (el) {
                            triggerRefs.current.set(dropdown.label, el);
                          }
                        }}
                        type="button"
                        variant={ButtonVariant.UNSTYLED}
                        className={cn(
                          'text-xs font-bold tracking-[0.1em] uppercase transition-colors inline-flex items-center gap-2 py-2',
                          isAnyActive
                            ? 'text-white'
                            : 'text-white/60 hover:text-white',
                        )}
                        onClick={() =>
                          isOpen
                            ? handleDropdownClose()
                            : handleDropdownOpen(dropdown.label)
                        }
                      >
                        {dropdown.label}
                        <HiChevronDown
                          className={cn(
                            'h-4 w-4 transition-transform duration-200',
                            isOpen && 'rotate-180',
                          )}
                        />
                      </Button>
                    </li>
                  );
                })}

                {/* Flat Nav Links */}
                {navLinks.map((link) => {
                  const isActive = isLinkActive(pathname, link.href);

                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={cn(
                          'text-xs font-bold tracking-[0.1em] uppercase transition-colors py-2',
                          isActive
                            ? 'text-white'
                            : 'text-white/60 hover:text-white',
                        )}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          {/* Right: CTA + Hamburger */}
          <div className="flex items-center gap-4">
            {rightContent}

            {/* Mobile Hamburger - hidden on desktop */}
            <div className="lg:hidden">
              <Button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                variant={ButtonVariant.UNSTYLED}
                className="inline-flex h-10 w-10 items-center justify-center transition-colors hover:bg-white/5"
                ariaLabel={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {isMobileMenuOpen ? (
                  <HiXMark className="h-6 w-6" />
                ) : (
                  <HiBars3 className="h-6 w-6" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop Dropdown Portal - isolated stacking context to appear above backdrop-blur header */}
      {mounted &&
        openDropdown &&
        currentDropdown &&
        createPortal(
          <div
            className="fixed hidden lg:block"
            style={{
              isolation: 'isolate',
              left: dropdownPosition.left,
              paddingTop: 8,
              top: dropdownPosition.top - 8,
              zIndex: 99999,
            }}
            onMouseEnter={() => handleDropdownOpen(openDropdown)}
            onMouseLeave={handleDropdownClose}
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
                      onClick={handleDropdownClose}
                    >
                      {Icon && (
                        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5 text-white/60" />
                      )}
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {item.label}
                        </span>
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
        )}

      {/* Mobile Menu Portal */}
      {mounted &&
        isMobileMenuOpen &&
        createPortal(
          <div className="lg:hidden fixed inset-0 z-[9999]">
            {/* Backdrop */}
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
              ariaLabel="Close menu"
            />

            {/* Menu Panel */}
            <div
              className="relative z-10 w-full max-h-[80vh] overflow-y-auto mt-20 border-b border-white/10"
              style={{ backgroundColor: '#09090b' }}
            >
              <nav className="container mx-auto px-6 py-6">
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
                                onClick={() => setIsMobileMenuOpen(false)}
                              >
                                {Icon && (
                                  <Icon className="h-5 w-5 text-white/50" />
                                )}
                                <span className="font-medium">
                                  {item.label}
                                </span>
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
                                onClick={() => setIsMobileMenuOpen(false)}
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
        )}
    </>
  );
}
