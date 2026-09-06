'use client';

import { ButtonVariant } from '@genfeedai/contracts';
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
import { ChevronDown, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

export default function IngredientDownloadButton({
  ingredientId,
  disabled,
  onDownloadOriginal,
}: IngredientDownloadButtonProps) {
  const translate = useTranslations('ui.watermarkDownload');
  const [isDownloading, setIsDownloading] = useState(false);
  const inFlight = useRef(false);
  const getService = useAuthedService((token) =>
    IngredientsService.getInstance(token),
  );

  async function download(watermark: boolean) {
    if (inFlight.current) return;
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

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label={translate('options')}
    >
      <Button
        variant={ButtonVariant.GHOST}
        withWrapper={false}
        className="rounded-r-none"
        ariaLabel={translate('original')}
        tooltip={translate('original')}
        isDisabled={disabled || isDownloading}
        isLoading={isDownloading}
        onClick={() => void download(false)}
      >
        <Download className="size-4" />
      </Button>
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
          <DropdownMenuItem onSelect={() => void download(false)}>
            {translate('original')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void download(true)}>
            {translate('branded')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
