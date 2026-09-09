'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import TopbarLogo from '@ui/topbars/logo/TopbarLogo';
import { ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useMounted } from '../../../lib/hooks';
import TopbarPublicDesktopDropdown, {
  type TopbarPublicMegaMenuFooter,
} from './TopbarPublicDesktopDropdown';
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
  /** Rendered under a grouped (full-width) panel only. */
  footer?: TopbarPublicMegaMenuFooter;
}

interface TopbarPublicProps {
  navLinks?: NavLink[];
  dropdowns?: Dropdown[];
  rightContent?: ReactNode;
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

/** Blur the bar reaches once its surface is fully in. */
const SURFACE_BLUR_PX = 24;

/**
 * Distance over which the bar's surface fades in, in pixels.
 *
 * The surface used to snap on at a fixed threshold, which is a hard cut in the
 * corner of the eye on a page that opens on full-bleed video. Ramping it over
 * the first part of a scroll means the glass arrives at the rate the content
 * arrives underneath it — the bar stops being a thing that changes state and
 * becomes a thing that responds.
 */
const SURFACE_RAMP_PX = 160;

/**
 * Drive the bar's surface straight from scroll position.
 *
 * Deliberately not React state: this runs on every scroll event, and a
 * re-render per frame to move one number is work the compositor will not thank
 * us for. The progress lands on a custom property and CSS does the rest.
 *
 * Also deliberately not throttled through requestAnimationFrame. Writing a
 * custom property reads no layout, so there is nothing to batch — and a frame
 * callback never fires at all while the tab is hidden, which leaves the bar
 * stuck at whatever it last painted.
 */
function useSurfaceProgress(
  headerRef: React.RefObject<HTMLElement | null>,
  isForcedOpaque: boolean,
): void {
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const apply = () => {
      const progress = isForcedOpaque
        ? 1
        : Math.min(window.scrollY / SURFACE_RAMP_PX, 1);

      header.style.setProperty('--topbar-surface', progress.toFixed(3));
      // The tint reads this custom property straight from CSS, but
      // `backdrop-filter` will not take a calc() over one — the declaration
      // resolves to the fallback and the blur never arrives. Setting the blur
      // outright is the only thing that actually works here.
      header.style.backdropFilter = `blur(${(progress * SURFACE_BLUR_PX).toFixed(1)}px)`;
    };

    apply();
    window.addEventListener('scroll', apply, { passive: true });

    return () => window.removeEventListener('scroll', apply);
  }, [headerRef, isForcedOpaque]);
}

export default function TopbarPublic({
  navLinks = EMPTY_ARRAY,
  dropdowns = EMPTY_ARRAY,
  rightContent,
}: TopbarPublicProps): React.ReactElement {
  const pathname = usePathname();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({
    left: 0,
    top: 0,
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useMounted();
  const headerRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement> | null>(null);
  if (triggerRefs.current === null) {
    triggerRefs.current = new Map<string, HTMLButtonElement>();
  }
  const triggerRefsMap = triggerRefs.current;

  useSurfaceProgress(headerRef, Boolean(openDropdown));

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
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      const trigger = triggerRefsMap.get(label);
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        setDropdownPosition({
          left: rect.left,
          top: rect.bottom + 8,
        });
      }
      setOpenDropdown(label);
    },
    [triggerRefsMap],
  );

  const handleDropdownClose = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
      closeTimeoutRef.current = null;
    }, 140);
  }, []);

  const handleDropdownCloseNow = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setOpenDropdown(null);
  }, []);

  useEffect(
    () => () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    },
    [],
  );

  // Get the current open dropdown data
  const currentDropdown = dropdowns.find((d) => d.label === openDropdown);

  return (
    <>
      {/*
        At the very top the bar is nothing but its own contents. A page that
        opens on full-bleed media has no seam to cover there, and a tinted,
        blurred strip across the top of it is a band of haze over the first
        thing anyone sees. The surface ramps in with the scroll — at the rate
        content actually starts passing underneath — rather than switching on at
        a threshold. Opening an overlay takes it to full immediately: a mega
        menu needs a ground of its own whether or not the page has moved, and
        that one *is* a state change, so it keeps its transition.
      */}
      <header
        className="fixed inset-x-0 top-0 z-50 w-full border-b border-[rgb(var(--edge)/calc(var(--topbar-surface,0)*0.12))] bg-[hsl(var(--background)/calc(var(--topbar-surface,0)*0.92))]"
        ref={headerRef}
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
                        aria-expanded={isOpen}
                        aria-haspopup="menu"
                        variant={ButtonVariant.UNSTYLED}
                        className={cn(
                          'text-xs font-bold tracking-[0.1em] uppercase transition-colors inline-flex items-center gap-2 py-2',
                          isAnyActive
                            ? 'text-foreground'
                            : 'text-foreground/60 hover:text-foreground',
                        )}
                        onClick={() => handleDropdownOpen(dropdown.label)}
                      >
                        {dropdown.label}
                        <ChevronDown
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
                            ? 'text-foreground'
                            : 'text-foreground/60 hover:text-foreground',
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
                className="inline-flex size-10 items-center justify-center transition-colors hover:bg-foreground/5"
                ariaLabel={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {isMobileMenuOpen ? (
                  <X className="size-6" />
                ) : (
                  <Menu className="size-6" />
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
        megaMenuFooter={currentDropdown?.footer}
        pathname={pathname}
        onMouseEnterDropdown={() => handleDropdownOpen(openDropdown ?? '')}
        onMouseLeaveDropdown={handleDropdownClose}
        onItemClick={handleDropdownCloseNow}
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
