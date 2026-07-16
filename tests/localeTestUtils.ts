import { vi } from 'vitest';

export function withSimulatedNumberLocale(
  locale: Intl.LocalesArgument,
  assertion: () => void,
): void {
  const originalToLocaleString = Number.prototype.toLocaleString;
  const toLocaleStringSpy = vi
    .spyOn(Number.prototype, 'toLocaleString')
    .mockImplementation(function (
      this: number,
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ) {
      return originalToLocaleString.call(this, locales ?? locale, options);
    });

  try {
    assertion();
  } finally {
    toLocaleStringSpy.mockRestore();
  }
}
