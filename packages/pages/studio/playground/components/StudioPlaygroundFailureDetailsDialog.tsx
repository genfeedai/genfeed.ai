'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StudioPlaygroundFailureDetailsDialogProps } from '@genfeedai/props/studio/studio-playground.props';
import { classifyGenerationFailure } from '@genfeedai/utils/media/generation-failure.util';
import { ClipboardService } from '@services/core/clipboard.service';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Pre } from '@ui/primitives/pre';
import { Copy, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useCallback } from 'react';

/**
 * The provider's full error and the prompt behind it, in a readable dialog
 * instead of a card-sized box. Reprompt and Remove stay one click away so a
 * reader can act as soon as they know why the generation failed.
 */
export default function StudioPlaygroundFailureDetailsDialog({
  isOpen,
  modelLabel,
  onOpenChange,
  onRemove,
  onReprompt,
  prompt,
  rawError,
  typeLabel,
}: StudioPlaygroundFailureDetailsDialogProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const detail = rawError?.trim() ?? '';
  const reason = classifyGenerationFailure(detail);

  const copyDetail = useCallback(() => {
    void ClipboardService.getInstance().copyToClipboard(detail);
  }, [detail]);

  const runAndClose = useCallback(
    (action: () => void) => {
      onOpenChange(false);
      action();
    },
    [onOpenChange],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto"
        data-testid="studio-failure-details"
      >
        <DialogHeader className="text-left">
          <DialogTitle>{translate('failure.dialog.title')}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className="text-2xs uppercase tracking-wide"
              variant="secondary"
            >
              {typeLabel}
            </Badge>
            <DialogDescription>{modelLabel}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <h3 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {translate('failure.dialog.reason')}
          </h3>
          <p className="text-sm text-foreground">
            {translate(`failure.reasons.${reason}`)}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {translate('failure.dialog.prompt')}
          </h3>
          <p className="break-words text-sm leading-relaxed text-foreground">
            {prompt}
          </p>
        </div>

        {detail ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {translate('failure.detailsLabel')}
            </h3>
            <Pre
              aria-label={translate('failure.detailsLabel')}
              className="max-h-72 w-full select-text overflow-auto text-left [overflow-wrap:anywhere]"
              size="sm"
            >
              {detail}
            </Pre>
          </div>
        ) : null}

        <DialogFooter>
          {detail ? (
            <Button
              icon={<Copy className="size-3.5" />}
              label={translate('failure.copyDetails')}
              onClick={copyDetail}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            />
          ) : null}
          <Button
            icon={<Trash2 className="size-3.5" />}
            label={translate('remove')}
            onClick={() => runAndClose(onRemove)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          />
          <Button
            icon={<RotateCcw className="size-3.5" />}
            label={translate('reprompt')}
            onClick={() => runAndClose(onReprompt)}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
