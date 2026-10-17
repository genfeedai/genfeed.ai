'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { isNativeSecondaryAppId } from '@genfeedai/contracts/constants';
import type { AppRailCustomizeProps } from '@genfeedai/props/ui/app-rail.props';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ArrowDown, ArrowUp, PinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { moveRailAppBy } from './app-rail.order';

/**
 * Keyboard and touch path to the rail order: every rail app with move up and
 * move down, and an unpin for secondary apps. Dragging in the rail itself
 * writes the same order.
 */
const DEFAULT_HOME_VALUE = 'default';

export function AppRailCustomize({
  defaultHomeLabel,
  homeAppId,
  homeOptions = [],
  isOpen,
  items,
  onHomeAppChange,
  onOpenChange,
  onReorder,
  onReset,
  onTogglePin,
}: AppRailCustomizeProps) {
  const t = useTranslations('common.appRail');
  const ids = items.map((item) => item.app.id);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent data-testid="app-rail-customize">
        <DialogHeader>
          <DialogTitle>{t('customizeTitle')}</DialogTitle>
          <DialogDescription>{t('customizeDescription')}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {items.map((item, index) => {
            const Icon = item.app.icon;
            const canUnpin =
              onTogglePin !== undefined && isNativeSecondaryAppId(item.app.id);
            return (
              <li
                className="flex items-center gap-2 rounded-lg px-2 py-1"
                data-testid={`app-rail-customize-item-${item.app.id}`}
                key={item.app.id}
              >
                <Icon
                  aria-hidden="true"
                  className="size-4 text-foreground/60"
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.label}
                </span>
                <Button
                  ariaLabel={t('moveUp', { app: item.label })}
                  isDisabled={index === 0}
                  onClick={() =>
                    onReorder(moveRailAppBy(ids, item.app.id, -1), {
                      id: item.app.id,
                      position: index,
                    })
                  }
                  size={ButtonSize.ICON}
                  type="button"
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  ariaLabel={t('moveDown', { app: item.label })}
                  isDisabled={index === items.length - 1}
                  onClick={() =>
                    onReorder(moveRailAppBy(ids, item.app.id, 1), {
                      id: item.app.id,
                      position: index + 2,
                    })
                  }
                  size={ButtonSize.ICON}
                  type="button"
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </Button>
                {canUnpin ? (
                  <Button
                    ariaLabel={t('unpin', { app: item.label })}
                    onClick={() => onTogglePin?.(item.app.id)}
                    size={ButtonSize.ICON}
                    type="button"
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  >
                    <PinOff aria-hidden="true" className="size-4" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {onHomeAppChange ? (
          <div className="flex flex-col gap-2" data-testid="app-rail-home">
            <div>
              <p className="text-sm font-medium">{t('homeTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('homeDescription')}
              </p>
            </div>
            <Select
              value={
                homeAppId && homeOptions.some((o) => o.app.id === homeAppId)
                  ? homeAppId
                  : DEFAULT_HOME_VALUE
              }
              onValueChange={(value) =>
                onHomeAppChange(value === DEFAULT_HOME_VALUE ? null : value)
              }
            >
              <SelectTrigger
                aria-label={t('homeTitle')}
                data-testid="app-rail-home-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_HOME_VALUE}>
                  {t('homeDefault', { app: defaultHomeLabel ?? '' })}
                </SelectItem>
                {homeOptions.map((option) => (
                  <SelectItem key={option.app.id} value={option.app.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Button
          onClick={onReset}
          type="button"
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {t('reset')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default AppRailCustomize;
