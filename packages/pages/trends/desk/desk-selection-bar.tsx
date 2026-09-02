'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useOptionalDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import type { DeskSelectionBarProps } from '@props/trends/discovery-desk.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { Kbd } from '@ui/primitives/kbd';
import { Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

/**
 * Sticky bottom bar shown while the Desk has a non-empty selection. Batch
 * remix awaits `openRemix` sequentially — the remix provider only runs one
 * job at a time and dedups identical in-flight sources — skipping items with
 * no `remixSelector` and reporting them in a single toast.
 */
export default function DeskSelectionBar({
  items,
  onClear,
}: DeskSelectionBarProps) {
  const remixSurface = useOptionalDiscoveryRemix();
  const translateDesk = useTranslations('trends.desk');
  const [isRemixing, setIsRemixing] = useState(false);

  const handleBatchRemix = useCallback(async () => {
    if (!remixSurface || items.length === 0) {
      return;
    }

    const remixable = items.filter((item) => item.remixSelector !== null);
    const skippedCount = items.length - remixable.length;

    setIsRemixing(true);
    try {
      for (const item of remixable) {
        if (!item.remixSelector) {
          continue;
        }
        try {
          await remixSurface.openRemix(item.remixSelector);
        } catch (error) {
          logger.error('Failed to open remix for desk selection item', {
            error,
            itemKey: item.key,
          });
        }
      }
    } finally {
      setIsRemixing(false);
    }

    if (skippedCount > 0) {
      NotificationsService.getInstance().info(
        translateDesk('selectionBar.skippedRemix', { count: skippedCount }),
      );
    }
  }, [items, remixSurface, translateDesk]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="gen-glass-strong pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2 shadow-lg">
        <span className="text-sm font-medium text-foreground">
          {translateDesk('selectionBar.count', { count: items.length })}
        </span>

        <Button
          icon={<Sparkles className="size-3.5" />}
          isDisabled={isRemixing}
          label={translateDesk('selectionBar.remix', { count: items.length })}
          onClick={() => {
            void handleBatchRemix();
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />

        <Button
          icon={<X className="size-3.5" />}
          label={translateDesk('selectionBar.clear')}
          onClick={onClear}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        />

        <span className="ml-1 hidden items-center gap-1.5 text-xs text-foreground/50 sm:flex">
          <Kbd size="sm">J</Kbd>
          <Kbd size="sm">K</Kbd>
          <span>move</span>
          <Kbd size="sm">X</Kbd>
          <span>select</span>
          <Kbd size="sm">R</Kbd>
          <span>remix</span>
          <Kbd size="sm">Esc</Kbd>
          <span>clear</span>
        </span>
      </div>
    </div>
  );
}
