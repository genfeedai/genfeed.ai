'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { LayoutProps } from '@props/layout/layout.props';
import Button from '@ui/buttons/base/Button';
import GallerySidebar from '@ui/gallery/layout/GallerySidebar';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { HiBars3, HiXMark } from 'react-icons/hi2';

export default function GalleryLayout({ children }: LayoutProps) {
  const _pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  // Auto-close on route change
  useEffect(() => {
    handleCloseSidebar();
  }, [handleCloseSidebar]);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isSidebarOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }

    return;
  }, [isSidebarOpen]);

  return (
    <div className="flex min-h-screen">
      {/* Mobile hamburger toggle */}
      <Button
        type="button"
        variant={ButtonVariant.UNSTYLED}
        className="fixed top-4 left-4 z-50 h-10 w-10 inline-flex items-center justify-center hover:bg-accent hover:text-accent-foreground lg:hidden"
        onClick={handleToggleSidebar}
        ariaLabel="Toggle navigation"
      >
        {isSidebarOpen ? (
          <HiXMark className="h-6 w-6" aria-hidden="true" />
        ) : (
          <HiBars3 className="h-6 w-6" aria-hidden="true" />
        )}
      </Button>

      {/* Desktop sidebar - hidden on mobile */}
      <aside className="hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:z-30">
        <GallerySidebar onClose={() => {}} />
      </aside>

      {/* Mobile overlay drawer */}
      <div
        className={cn(
          'lg:hidden fixed inset-0 z-40 flex transition-opacity duration-200',
          isSidebarOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0',
        )}
      >
        {/* Backdrop */}
        <Button
          type="button"
          ariaLabel="Close navigation"
          variant={ButtonVariant.UNSTYLED}
          className="absolute inset-0 bg-foreground/40"
          onClick={handleCloseSidebar}
        />

        {/* Drawer */}
        <div
          className={cn(
            'relative h-full w-64 max-w-[85vw] bg-card shadow-2xl transition-transform duration-200',
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <GallerySidebar onClose={handleCloseSidebar} />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 min-h-screen overflow-x-hidden flex justify-center">
        {children}
      </main>
    </div>
  );
}
