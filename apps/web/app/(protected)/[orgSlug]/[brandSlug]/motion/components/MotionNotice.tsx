'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { MotionControllerProps } from '@/features/motion/props/motion-workspace.props';

/** Renderer availability and the last error, with a reload on a stale revision. */
export default function MotionNotice({
  controller,
}: MotionControllerProps): ReactElement | null {
  const t = useTranslations('pages.studioMotion');
  const { catalog, error, isStaleRevision, reloadLatestRevision } = controller;
  if (!error && !(catalog && !catalog.isAvailable)) return null;
  return (
    <div className="grid gap-3 text-sm">
      {catalog && !catalog.isAvailable && (
        <p role="status">
          {t('unavailable')} {catalog.unavailableReason}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-destructive"
        >
          <p>{error}</p>
          {isStaleRevision ? (
            <Button
              variant={ButtonVariant.GHOST}
              onClick={reloadLatestRevision}
            >
              {t('reloadRevision')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
