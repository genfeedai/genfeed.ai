'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { TopbarProps } from '@props/navigation/topbar.props';
import { Button } from '@ui/primitives/button';
import TopbarBreadcrumbs from '@ui/topbars/breadcrumbs/TopbarBreadcrumbs';
import { HiBars3, HiOutlineSparkles, HiXMark } from 'react-icons/hi2';

export default function AdminTopbar({
  onMenuToggle,
  isMenuOpen,
  isAgentCollapsed,
  onAgentToggle,
}: TopbarProps = {}) {
  const ToggleIcon = isMenuOpen ? HiXMark : HiBars3;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-1">
          {onMenuToggle ? (
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              className="md:hidden"
              aria-label={
                isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'
              }
              aria-expanded={Boolean(isMenuOpen)}
              onClick={onMenuToggle}
            >
              <ToggleIcon className="h-5 w-5" />
            </Button>
          ) : null}

          <TopbarBreadcrumbs rootLabel="Admin" />
        </div>

        <div className="flex items-center gap-4">
          {onAgentToggle ? (
            <Button
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.ICON}
              className={`hidden h-8 w-8 lg:inline-flex ${
                isAgentCollapsed
                  ? 'border-primary/30 text-primary hover:border-primary/40 hover:bg-primary/10'
                  : 'border-white/[0.12] text-white/60 hover:border-white/30 hover:bg-white/[0.06]'
              }`}
              aria-label={
                isAgentCollapsed ? 'Open agent panel' : 'Close agent panel'
              }
              onClick={onAgentToggle}
            >
              <HiOutlineSparkles className="h-5 w-5" />
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
