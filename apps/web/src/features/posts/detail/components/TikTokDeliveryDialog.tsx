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

const OPTION_CLASS_NAME =
  'h-auto w-full flex-col items-start justify-start gap-0.5 py-2 text-left';

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
        <DialogBody className="flex flex-col gap-1">
          <Button
            className={OPTION_CLASS_NAME}
            onClick={() => onChoose('inbox')}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <span className="font-medium">{translate('inboxAction')}</span>
            <span className="text-xs font-normal normal-case text-muted-foreground">
              {translate('inboxDescription')}
            </span>
          </Button>
          <Button
            className={OPTION_CLASS_NAME}
            onClick={() => onChoose('direct')}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <span className="font-medium">{translate('directAction')}</span>
            <span className="text-xs font-normal normal-case text-muted-foreground">
              {translate('directDescription')}
            </span>
          </Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
