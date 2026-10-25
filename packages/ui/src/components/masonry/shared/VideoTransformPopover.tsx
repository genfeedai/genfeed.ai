'use client';

import { ButtonSize } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverAnchor,
  PopoverPanelContent,
} from '@ui/primitives/popover';
import { type ReactNode, useMemo, useState } from 'react';

export interface VideoTransformPopoverProps {
  /** The tile the pickers belong to. Without a match the panel opens centred. */
  anchorIngredientId?: string;
  children: ReactNode;
  confirmLabel: string;
  dialogLabel: string;
  isConfirmDisabled?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

interface PopoverAnchorRef {
  current: { getBoundingClientRect: () => DOMRect };
}

function findTile(ingredientId: string | undefined): Element | null {
  if (!ingredientId || typeof document === 'undefined') {
    return null;
  }
  const id = CSS.escape(ingredientId);
  return (
    document.querySelector(`[data-ingredient-id="${id}"]`) ??
    document.querySelector(`[data-testid="studio-asset-${id}"]`)
  );
}

function getViewportCenterRect(): DOMRect {
  const x = window.innerWidth / 2;
  const y = window.innerHeight / 3;
  return new DOMRect(x, y, 0, 0);
}

/**
 * The inline replacement for the video upscale and extend dialogs: a panel
 * anchored under the tile, with the pickers inside and the price on the one
 * action. Escape or a click elsewhere closes it without charging anything.
 */
export default function VideoTransformPopover({
  anchorIngredientId,
  children,
  confirmLabel,
  dialogLabel,
  isConfirmDisabled = false,
  onClose,
  onConfirm,
}: VideoTransformPopoverProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const anchor = useMemo<PopoverAnchorRef>(() => {
    const tile = findTile(anchorIngredientId);
    return {
      current: {
        getBoundingClientRect: () =>
          tile?.getBoundingClientRect() ?? getViewportCenterRect(),
      },
    };
  }, [anchorIngredientId]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Popover
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSubmitting) {
          onClose();
        }
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      <PopoverPanelContent
        align="start"
        aria-label={dialogLabel}
        className="w-[min(22rem,calc(100vw-2rem))] space-y-3 p-3"
        // The tile menu that opened this hands focus back to its trigger as it
        // closes; only a click elsewhere or Escape should dismiss the panel.
        onFocusOutside={(event) => event.preventDefault()}
        side="bottom"
      >
        {children}
        <Button
          className="w-full"
          isDisabled={isConfirmDisabled}
          isLoading={isSubmitting}
          label={confirmLabel}
          onClick={handleConfirm}
          size={ButtonSize.DEFAULT}
          textTransform="none"
          wrapperClassName="flex w-full"
        />
      </PopoverPanelContent>
    </Popover>
  );
}
