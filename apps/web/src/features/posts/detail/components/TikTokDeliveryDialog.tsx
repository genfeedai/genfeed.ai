'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useTranslations } from 'next-intl';

export type TikTokDeliveryChoice = 'inbox' | 'direct';

export interface TikTokDeliveryDialogProps {
  isOpen: boolean;
  onChoose: (choice: TikTokDeliveryChoice) => void;
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * Asks how a failed TikTok video should go back out. It only opens when the
 * post has not recorded Inbox delivery, so a retry never guesses.
 */
export default function TikTokDeliveryDialog({
  isOpen,
  onChoose,
  onOpenChange,
}: TikTokDeliveryDialogProps) {
  const translate = useTranslations('pages.posts.detail.tiktokDelivery');

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Button
              className="w-full justify-start"
              label={translate('inboxAction')}
              onClick={() => onChoose('inbox')}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            />
            <p className="text-xs text-muted-foreground">
              {translate('inboxDescription')}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Button
              className="w-full justify-start"
              label={translate('directAction')}
              onClick={() => onChoose('direct')}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            />
            <p className="text-xs text-muted-foreground">
              {translate('directDescription')}
            </p>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
