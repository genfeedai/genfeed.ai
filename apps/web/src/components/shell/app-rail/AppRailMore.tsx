'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Ellipsis, Pin } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AppRailMoreProps } from '@/props/ui/app-rail.props';

/**
 * The overflow entry, ChatGPT-style: apps the member installed but did not
 * put on the rail (and core apps the member took off it), one click from
 * opening or pinning.
 */
export function AppRailMore({ items, onOpen, onTogglePin }: AppRailMoreProps) {
  const t = useTranslations('common.appRail');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          ariaLabel={t('more')}
          className="size-8 text-foreground/50 hover:text-foreground"
          data-testid="app-rail-more"
          size={ButtonSize.ICON}
          type="button"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <Ellipsis aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-56 flex-col gap-1 p-1.5"
        data-testid="app-rail-more-menu"
        side="right"
        sideOffset={10}
      >
        {items.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            {t('noMoreApps')}
          </p>
        ) : (
          items.map((item) => {
            const Icon = item.app.icon;
            return (
              <div
                className="flex items-center gap-1 rounded-md hover:bg-foreground/5"
                key={item.app.id}
              >
                <Link
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm"
                  data-testid={`app-rail-more-item-${item.app.id}`}
                  href={item.href}
                  onClick={() => {
                    onOpen(item);
                    setIsOpen(false);
                  }}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
                {onTogglePin ? (
                  <Button
                    ariaLabel={t('pin', { app: item.label })}
                    className="mr-1 size-7 text-foreground/50 hover:text-foreground"
                    data-testid={`app-rail-more-pin-${item.app.id}`}
                    onClick={() => onTogglePin(item.app.id)}
                    size={ButtonSize.ICON}
                    type="button"
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  >
                    <Pin aria-hidden="true" className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

export default AppRailMore;
