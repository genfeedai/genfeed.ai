'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';

export interface MasonryUnavailableActionsProps {
  isDeleting?: boolean;
  onDelete: () => void;
  onMouseEnter: () => void;
  onMouseLeave: (e: MouseEvent) => void;
}

/**
 * The only action on a tile that has no asset to act on yet (failed or still
 * generating). Its own component so a tile that is ready calls no
 * `useTranslations`, like `MasonryFailureNotice`.
 */
export default function MasonryUnavailableActions({
  isDeleting,
  onDelete,
  onMouseEnter,
  onMouseLeave,
}: MasonryUnavailableActionsProps): React.ReactElement {
  const translate = useTranslations('common.libraryRetry');

  return (
    <div
      role="presentation"
      className="quick-actions-wrapper flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Button
        ariaLabel={translate('moveToTrash')}
        tooltip={translate('moveToTrash')}
        icon={<Trash2 />}
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.SM}
        isDisabled={isDeleting}
        onClick={onDelete}
      />
    </div>
  );
}
