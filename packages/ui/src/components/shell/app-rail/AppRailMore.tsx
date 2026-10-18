'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AppRailMoreProps } from '@genfeedai/props/ui/app-rail.props';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Separator } from '@ui/primitives/separator';
import { Ellipsis, Pin, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * The overflow entry, ChatGPT-style: apps the member installed but did not
 * put on the rail (and core apps the member took off it), one click from
 * opening or pinning, plus the way back to the default rail.
 */
export function AppRailMore({
  isSuspended = false,
  items,
  onOpen,
  onReset,
  onTogglePin,
}: AppRailMoreProps) {
  const t = useTranslations('common.appRail');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          ariaLabel={t('more')}
          className="size-8 text-foreground/50 hover:text-foreground"
          data-testid="app-rail-more"
          isDisabled={isSuspended}
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
                className="flex items-center gap-1 rounded-md hover:bg-foreground/[0.06]"
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
                  prefetch={false}
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
        {onReset ? (
          <>
            <Separator className="my-1" />
            <Button
              className="w-full justify-start gap-2 px-2"
              data-testid="app-rail-reset"
              onClick={() => {
                setIsOpen(false);
                onReset();
              }}
              type="button"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              {t('reset')}
            </Button>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export default AppRailMore;
