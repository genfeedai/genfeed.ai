'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useTranslations } from 'next-intl';
import type { ModelFixPromptFallback } from './use-model-fix-prompt';

interface ModelFixPromptFallbackDialogProps {
  fallback: ModelFixPromptFallback | null;
  onClose: () => void;
}

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
        <pre className="max-h-96 select-all overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-xs">
          {fallback?.text}
        </pre>
        <DialogFooter>
          <Button variant={ButtonVariant.SECONDARY} onClick={onClose}>
            {t('promptFallbackClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
