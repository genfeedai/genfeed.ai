'use client';

import {
  BG_BLUR,
  BORDER_WHITE_30,
  cn,
} from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppLink } from '@genfeedai/interfaces/ui/navigation.interface';
import { Kbd } from '@genfeedai/ui';
import Badge from '@ui/display/badge/Badge';
import Portal from '@ui/layout/portal/Portal';
import Link from 'next/link';
import type { RefObject } from 'react';

type AppSwitcherPanelProps = {
  adminApps: AppLink[];
  currentApp: string;
  dropdownRef: RefObject<HTMLUListElement>;
  regularApps: AppLink[];
  onClose: () => void;
};

export function AppSwitcherPanel({
  adminApps,
  currentApp,
  dropdownRef,
  regularApps,
  onClose,
}: AppSwitcherPanelProps) {
  return (
    <Portal>
      <ul
        ref={dropdownRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className={cn(
          BG_BLUR,
          BORDER_WHITE_30,
          'app-switcher-dropdown z-50 w-[480px] fixed p-2 list-none',
        )}
      >
        <div className="w-full">
          {regularApps.length > 0 && (
            <div className="grid grid-cols-2 gap-2 px-2 mb-2">
              {regularApps.map((app) => {
                const isActive = currentApp === app.label;
                const baseClasses = cn(
                  'flex items-center transition-all text-foreground',
                  'hover:bg-foreground/15 transition-colors duration-200',
                  isActive && 'bg-foreground/15',
                );
                return (
                  <Link
                    key={app.href}
                    href={app.href}
                    className={cn(baseClasses, 'gap-2.5 px-2.5 py-2')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                    }}
                  >
                    <div className="flex-shrink-0">{app.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {app.label}
                      </div>
                      <div className="text-xs text-foreground/60 truncate">
                        {app.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {app.shortcut && currentApp !== app.label && (
                        <div className="flex gap-2">
                          {app.shortcut.map((key) => (
                            <Kbd
                              key={key}
                              className="bg-foreground/10 text-foreground/70 border border-foreground/20"
                            >
                              {key}
                            </Kbd>
                          ))}
                        </div>
                      )}
                      {isActive && (
                        <Badge className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-foreground/20 border border-foreground/[0.08] text-foreground/90">
                          Current
                        </Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {adminApps.length > 0 && (
            <>
              {regularApps.length > 0 && (
                <div className="my-2 border-t border-foreground/[0.08]" />
              )}
              <div className="px-2">
                {adminApps.map((app) => {
                  const isActive = currentApp === app.label;
                  const baseClasses = cn(
                    'flex items-center transition-all text-foreground',
                    'hover:bg-foreground/15 transition-colors duration-200',
                    isActive && 'bg-foreground/15',
                  );
                  return (
                    <Link
                      key={app.href}
                      href={app.href}
                      className={cn(baseClasses, 'gap-3 px-3 py-2.5 w-full')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                      }}
                    >
                      <div className="flex-shrink-0">{app.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {app.label}
                        </div>
                        <div className="text-xs text-foreground/60 truncate">
                          {app.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {app.shortcut && currentApp !== app.label && (
                          <div className="flex gap-2">
                            {app.shortcut.map((key) => (
                              <Kbd
                                key={key}
                                className="bg-foreground/10 text-foreground/70 border border-foreground/20"
                              >
                                {key}
                              </Kbd>
                            ))}
                          </div>
                        )}
                        {isActive && (
                          <Badge className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-foreground/20 border border-foreground/[0.08] text-foreground/90">
                            Current
                          </Badge>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </ul>
    </Portal>
  );
}
