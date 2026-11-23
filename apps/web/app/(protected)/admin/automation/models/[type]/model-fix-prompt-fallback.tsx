'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ModelFixPromptFallbackDialogProps } from '@props/admin/model-fix-prompt.props';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';

/** The prompt as selectable text, for browsers that refuse clipboard writes. */
export default function ModelFixPromptFallbackDialog({
  fallback,
  onClose,
}: ModelFixPromptFallbackDialogProps) {
  const t = useTranslations('pages.adminModelPricing');
  return (
    <Dialog
      open={fallback !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fallback?.title}</DialogTitle>
          <DialogDescription>{t('promptFallbackHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Textarea
            aria-label={fallback?.title}
            className="max-h-96 font-mono text-xs"
            isReadOnly
            rows={14}
            value={fallback?.text ?? ''}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant={ButtonVariant.SECONDARY} onClick={onClose}>
            {t('promptFallbackClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
