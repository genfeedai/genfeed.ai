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
    ['black', ButtonVariant.DEFAULT],
    ['generate', ButtonVariant.DEFAULT],
    ['white', ButtonVariant.DEFAULT],
    ['outline', ButtonVariant.SECONDARY],
    ['outline-white', ButtonVariant.SECONDARY],
    ['soft', ButtonVariant.SECONDARY],
  ])('normalizes the withdrawn %s variant', (legacyVariant, expected) => {
    expect(resolveButtonVariant(legacyVariant as ButtonVariant)).toBe(expected);
  });

  it('falls back to default for an unknown runtime value', () => {
    expect(resolveButtonVariant('unknown' as ButtonVariant)).toBe(
      ButtonVariant.DEFAULT,
    );
  });
});
