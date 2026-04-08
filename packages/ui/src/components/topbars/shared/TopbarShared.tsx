'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { TopbarProps } from '@props/navigation/topbar.props';
import { Button } from '@ui/primitives/button';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import TopbarEnd from '@ui/topbars/end/TopbarEnd';
import { HiBars3, HiXMark } from 'react-icons/hi2';

export default function TopbarShared({
  onMenuToggle,
  isMenuOpen,
}: TopbarProps = {}) {
  const ToggleIcon = isMenuOpen ? HiXMark : HiBars3;

  return (
    <header className="h-full w-full bg-transparent">
      <div className="flex h-full w-full items-center justify-between pl-4 pr-2 sm:pl-6 sm:pr-3 lg:pl-8 lg:pr-2">
        <div className="flex items-center gap-1">
          {/* Mobile hamburger */}
          {onMenuToggle ? (
            <Button
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className="h-10 w-10 inline-flex items-center justify-center hover:bg-accent hover:text-accent-foreground md:hidden"
              ariaLabel={
                isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'
              }
              onClick={onMenuToggle}
            >
              <ToggleIcon className="h-5 w-5" />
            </Button>
          ) : null}

          <TopbarBreadcrumbs />
        </div>

        <div className="flex items-center gap-4">
          <TopbarEnd />
        </div>
      </div>
    </header>
  );
}
