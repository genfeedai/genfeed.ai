'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiBars3, HiChevronDown, HiXMark } from 'react-icons/hi2';
import TopbarPublicDesktopDropdown from './TopbarPublicDesktopDropdown';
import TopbarPublicMobileMenu from './TopbarPublicMobileMenu';

const EMPTY_ARRAY: never[] = [];

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
  navLinks = EMPTY_ARRAY,
  dropdowns = EMPTY_ARRAY,
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
  const triggerRefs = useRef<Map<string, HTMLButtonElement> | null>(null);
  const _megaMenuRef = useRef<HTMLDivElement>(null);
  if (triggerRefs.current === null) {
    triggerRefs.current = new Map<string, HTMLButtonElement>();
  }
  const triggerRefsMap = triggerRefs.current;

  // Handle hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when mobile menu is open
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 20);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
        const firstTrigger = triggerRefsMap.get(dropdowns[0].label);
        if (firstTrigger) {
          const rect = firstTrigger.getBoundingClientRect();
          setDropdownPosition({
            left: rect.left,
            top: rect.bottom,
          });
        }
        setOpenDropdown('mega');
      } else {
        const trigger = triggerRefsMap.get(label);
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
    [megaMenu, dropdowns, triggerRefsMap],
  );

  const handleDropdownClose = useCallback(() => {
    setOpenDropdown(null);
  }, []);

  // Get the current open dropdown data
  const currentDropdown = dropdowns.find((d) => d.label === openDropdown);

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 w-full transition-all duration-300',
          isScrolled
            ? 'border-b border-white/10 bg-primary/60 backdrop-blur-2xl'
            : 'border-b border-transparent bg-transparent',
        )}
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
                            triggerRefsMap.set(dropdown.label, el);
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
                            'size-4 transition-transform duration-200',
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
                className="inline-flex size-10 items-center justify-center transition-colors hover:bg-white/5"
                ariaLabel={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {isMobileMenuOpen ? (
                  <HiXMark className="size-6" />
                ) : (
                  <HiBars3 className="size-6" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop Dropdown Portal - isolated stacking context to appear above backdrop-blur header */}
      <TopbarPublicDesktopDropdown
        mounted={mounted}
        openDropdown={openDropdown}
        currentDropdown={currentDropdown}
        dropdownPosition={dropdownPosition}
        pathname={pathname}
        onMouseEnterDropdown={() => handleDropdownOpen(openDropdown ?? '')}
        onMouseLeaveDropdown={handleDropdownClose}
        onItemClick={handleDropdownClose}
      />

      {/* Mobile Menu Portal */}
      <TopbarPublicMobileMenu
        mounted={mounted}
        isMobileMenuOpen={isMobileMenuOpen}
        dropdowns={dropdowns}
        navLinks={navLinks}
        pathname={pathname}
        onClose={() => setIsMobileMenuOpen(false)}
      />
    </>
  );
}
