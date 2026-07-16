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
    const result = assertion();

    if (result instanceof Promise) {
      return result.finally(() => {
        toLocaleStringSpy.mockRestore();
      });
    }

    toLocaleStringSpy.mockRestore();
  } catch (error) {
    toLocaleStringSpy.mockRestore();
    throw error;
  }
}
