import { vi } from 'vitest';

export function withSimulatedNumberLocale(
  locale: Intl.LocalesArgument,
  assertion: () => Promise<void>,
): Promise<void>;
export function withSimulatedNumberLocale(
  locale: Intl.LocalesArgument,
  assertion: () => void,
): void;
export function withSimulatedNumberLocale(
  locale: Intl.LocalesArgument,
  assertion: () => void | Promise<void>,
): void | Promise<void> {
  const originalToLocaleString = Number.prototype.toLocaleString;
  const OriginalNumberFormat = Intl.NumberFormat;
  function simulatedNumberFormat(
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions,
  ): Intl.NumberFormat {
    return new OriginalNumberFormat(locales ?? locale, options);
  }
  const toLocaleStringSpy = vi
    .spyOn(Number.prototype, 'toLocaleString')
    .mockImplementation(function (
      this: number,
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ) {
      return originalToLocaleString.call(this, locales ?? locale, options);
    });
  const numberFormatSpy = vi
    .spyOn(Intl, 'NumberFormat')
    .mockImplementation(simulatedNumberFormat);

  const restore = (): void => {
    numberFormatSpy.mockRestore();
    toLocaleStringSpy.mockRestore();
  };

  try {
    const result = assertion();

    if (result instanceof Promise) {
      return result.finally(restore);
    }

    restore();
  } catch (error) {
    restore();
    throw error;
  }
}
