import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
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

  it('left-aligns labeled ghost buttons', () => {
    const className = buttonVariants({
      size: ButtonSize.DEFAULT,
      variant: ButtonVariant.GHOST,
    });

    expect(className).toContain('justify-start');
  });

  it('uses the themed hairline on the default action', () => {
    const className = buttonVariants({
      variant: ButtonVariant.DEFAULT,
    });

    expect(className).toContain('shadow-border');
    expect(className).not.toContain('rgba(');
  });

  it.each([ButtonSize.SM, ButtonSize.XS])(
    'keeps regular %s controls on the 32px ladder step',
    (size) => {
      const className = buttonVariants({ size });

      expect(className).toContain('h-8');
      expect(className).not.toMatch(/\bh-[67]\b/);
    },
  );

  it('reserves the named micro scale for dense icon-only chrome', () => {
    const className = buttonVariants({ size: ButtonSize.MICRO });

    expect(className).toContain('size-7');
    expect(className).toContain('justify-center');
    expect(className).toContain('p-0');
  });

  it.each(Object.values(ButtonSize))(
    'uses typography tokens rather than bracket sizes for %s',
    (size) => {
      expect(buttonVariants({ size })).not.toMatch(/\btext-\[/);
    },
  );
});
