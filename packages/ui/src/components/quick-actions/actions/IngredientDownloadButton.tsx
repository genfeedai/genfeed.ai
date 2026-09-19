'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { downloadUrl } from '@genfeedai/helpers/media/download/download.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { IngredientDownloadButtonProps } from '@genfeedai/props/content/quick-actions.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { QUICK_ACTION_TRIGGER_CLASS } from '@ui/quick-actions/quick-actions.constants';
import { ChevronDown, Download, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

export default function IngredientDownloadButton({
  ingredientId,
  disabled,
  onDownloadOriginal,
  isCompact = false,
  canDownloadOriginal = true,
}: IngredientDownloadButtonProps) {
  const translate = useTranslations('ui.watermarkDownload');
  const [isDownloading, setIsDownloading] = useState(false);
  const inFlight = useRef(false);
  const getService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );

  async function download(watermark: boolean) {
    if (inFlight.current) return;
    if (!watermark && !canDownloadOriginal) return;
    inFlight.current = true;
    setIsDownloading(true);
    try {
      if (watermark) {
        const service = await getService();
        const result = await service.exportMedia(ingredientId, true);
        await downloadUrl(result.url, result.filename);
      } else {
        await onDownloadOriginal();
      }
    } catch {
      NotificationsService.getInstance().error(translate('errorTitle'), {
        description: translate(watermark ? 'watermarkError' : 'error'),
      });
    } finally {
      inFlight.current = false;
      setIsDownloading(false);
    }
  }

  const originalMenuItem = (
    <DropdownMenuItem
      disabled={!canDownloadOriginal}
      onSelect={() => void download(false)}
    >
      {canDownloadOriginal ? null : (
        <Lock aria-hidden="true" className="size-3.5" />
      )}
      {translate('original')}
      {canDownloadOriginal ? null : (
        <span className="ml-auto pl-3 text-xs text-muted-foreground">
          {translate('upgradeHint')}
        </span>
      )}
    </DropdownMenuItem>
  );

  if (isCompact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            className={cn(
              QUICK_ACTION_TRIGGER_CLASS,
              'size-7 p-0 text-muted-foreground hover:bg-hover hover:text-foreground',
            )}
            ariaLabel={translate('options')}
            tooltip={translate('options')}
            tooltipPosition="top"
            isDisabled={disabled || isDownloading}
            isLoading={isDownloading}
          >
            <Download className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {originalMenuItem}
          <DropdownMenuItem onSelect={() => void download(true)}>
            {translate('branded')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const originalButton = (
    <Button
      variant={ButtonVariant.GHOST}
      withWrapper={false}
      className="rounded-r-none"
      ariaLabel={translate('original')}
      tooltip={canDownloadOriginal ? translate('original') : undefined}
      isDisabled={disabled || isDownloading || !canDownloadOriginal}
      isLoading={isDownloading}
      onClick={() => void download(false)}
    >
      {canDownloadOriginal ? (
        <Download className="size-4" />
      ) : (
        <Lock className="size-4" />
      )}
    </Button>
  );

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label={translate('options')}
    >
      {canDownloadOriginal ? (
        originalButton
      ) : (
        // A disabled button emits no pointer events, so the focusable wrapper
        // is the tooltip trigger that explains the lock.
        <SimpleTooltip label={translate('originalLocked')}>
          <span
            aria-disabled="true"
            aria-label={translate('originalLocked')}
            className="inline-flex rounded-l-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            role="button"
            tabIndex={0}
          >
            {originalButton}
          </span>
        </SimpleTooltip>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            className="rounded-l-none border-l border-border px-1"
            ariaLabel={translate('options')}
            isDisabled={disabled || isDownloading}
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {originalMenuItem}
          <DropdownMenuItem onSelect={() => void download(true)}>
            {translate('branded')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
