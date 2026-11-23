'use client';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useTranslations } from 'next-intl';
import {
  AdsResearchWatchlistPanel,
  type AdsResearchWatchlistPanelProps,
} from './AdsResearchWatchlistPanel';

export type AdsResearchWatchlistModalProps = AdsResearchWatchlistPanelProps & {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * The competitor watchlist as a modal: a task the operator opens, finishes
 * and closes, not a panel that pushes the ads down the page.
 */
export function AdsResearchWatchlistModal({
  isOpen,
  onOpenChange,
  ...panelProps
}: AdsResearchWatchlistModalProps) {
  const translate = useTranslations('pages.adsResearch.watchlist');

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div>
            <AdsResearchWatchlistPanel {...panelProps} />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
