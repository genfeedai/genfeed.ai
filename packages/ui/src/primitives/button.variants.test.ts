import { ButtonVariant } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import { BUTTON_VARIANT_CONFIG, resolveButtonVariant } from './button.variants';

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

  it.each([
    [ButtonVariant.BLACK, ButtonVariant.DEFAULT],
    [ButtonVariant.GENERATE, ButtonVariant.DEFAULT],
    [ButtonVariant.WHITE, ButtonVariant.DEFAULT],
    [ButtonVariant.OUTLINE, ButtonVariant.SECONDARY],
    [ButtonVariant.OUTLINE_WHITE, ButtonVariant.SECONDARY],
    [ButtonVariant.SOFT, ButtonVariant.SECONDARY],
  ])('normalizes the deprecated %s variant', (legacyVariant, expected) => {
    expect(resolveButtonVariant(legacyVariant)).toBe(expected);
  });

  it('falls back to default for an unknown runtime value', () => {
    expect(resolveButtonVariant('unknown' as ButtonVariant)).toBe(
      ButtonVariant.DEFAULT,
    );
  });
});
