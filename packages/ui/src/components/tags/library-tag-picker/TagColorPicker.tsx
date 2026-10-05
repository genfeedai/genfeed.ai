'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { TAG_COLOR_PALETTE } from '@genfeedai/contracts/constants';
import type { ITagColorSwatch } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface TagColorPickerProps {
  className?: string;
  /** Background color of the swatch currently in effect. */
  value?: string | null;
  onChange: (swatch: ITagColorSwatch) => void;
}

/**
 * The palette a tag color is chosen from. Each swatch carries a text color
 * that reads on it, so a member picks one color, never a contrast pair.
 */
export default function TagColorPicker({
  className,
  onChange,
  value,
}: TagColorPickerProps) {
  const translate = useTranslations('pages.library.tags');
  const selected = value?.toLowerCase();

  return (
    <div
      aria-label={translate('colorLabel')}
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      role="group"
    >
      {TAG_COLOR_PALETTE.map((swatch) => {
        const isSelected = swatch.backgroundColor.toLowerCase() === selected;

        return (
          <Button
            ariaLabel={swatch.name}
            aria-pressed={isSelected}
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full ring-offset-1 ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isSelected
                ? 'ring-2 ring-foreground'
                : 'hover:ring-2 ring-foreground/40',
            )}
            key={swatch.backgroundColor}
            onClick={() => onChange(swatch)}
            style={{
              backgroundColor: swatch.backgroundColor,
              color: swatch.textColor,
            }}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            {isSelected ? <Check className="size-3" /> : null}
          </Button>
        );
      })}
    </div>
  );
}
