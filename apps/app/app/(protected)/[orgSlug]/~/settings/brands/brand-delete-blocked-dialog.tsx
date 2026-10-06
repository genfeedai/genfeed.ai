'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import type { BrandDeleteBlockedDialogProps } from '@props/characters/characters-page.props';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function BrandDeleteBlockedDialog({
  brandLabel,
  brandSlug,
  characters,
  onClose,
  orgSlug,
}: BrandDeleteBlockedDialogProps) {
  const translate = useTranslations('common.settings.characters.deleteBlocked');

  return (
    <Dialog
      open={characters.length > 0}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>
            {translate('description', { brand: brandLabel })}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1 text-sm" data-testid="blocked-list">
          {characters.map((character) => (
            <li key={character.id}>
              {character.label}
              {character.handle ? (
                <span className="text-muted-foreground">
                  {' '}
                  @{character.handle}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            data-testid="blocked-close"
            label={translate('close')}
            onClick={onClose}
            variant={ButtonVariant.GHOST}
          />
          {orgSlug && brandSlug ? (
            <Link
              className="text-sm underline underline-offset-4"
              href={createBrandAppRoute(
                orgSlug,
                brandSlug,
                APP_ROUTES.LIBRARY.CHARACTERS,
              )}
            >
              {translate('manage')}
            </Link>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
