import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  BUTTON_VARIANT_CONFIG,
  buttonVariants,
  resolveButtonVariant,
} from './button.variants';

describe('button variants', () => {
  it('defines only the canonical semantic variants', () => {
    expect(Object.keys(BUTTON_VARIANT_CONFIG)).toEqual([
      ButtonVariant.DEFAULT,
      ButtonVariant.DESTRUCTIVE,
      ButtonVariant.GHOST,
      ButtonVariant.LINK,
      ButtonVariant.SECONDARY,
      ButtonVariant.UNSTYLED,
    ]);
  });

  it('falls back to default for an unknown runtime value', () => {
    expect(resolveButtonVariant('unknown' as ButtonVariant)).toBe(
      ButtonVariant.DEFAULT,
    );
  });

  it('centers the glyph on ghost icon buttons', () => {
    const className = buttonVariants({
      size: ButtonSize.ICON,
      variant: ButtonVariant.GHOST,
    });

    expect(className).toContain('justify-center');
    expect(className.split(/\s+/)).not.toContain('justify-start');
  });
});
