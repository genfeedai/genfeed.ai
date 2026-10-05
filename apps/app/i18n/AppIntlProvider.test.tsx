import { DEFAULT_LOCALE, PSEUDO_LOCALE } from '@genfeedai/contracts/constants';
import { render, screen } from '@testing-library/react';
import { useMessages, useTimeZone, useTranslations } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import AppIntlProvider from './AppIntlProvider';
import { loadMessages } from './messages';
import { pseudoLocalizeMessage } from './pseudo';

interface LocaleProbeProps {
  onMessages: (messages: ReturnType<typeof useMessages>) => void;
}

function LocaleProbe({ onMessages }: LocaleProbeProps) {
  onMessages(useMessages());
  const translate = useTranslations('common');
  const timeZone = useTimeZone();

  return (
    <>
      <span>{translate('actions.save')}</span>
      <span>{timeZone}</span>
    </>
  );
}

describe('AppIntlProvider', () => {
  it.each([
    { locale: DEFAULT_LOCALE, save: 'Save' },
    { locale: PSEUDO_LOCALE, save: pseudoLocalizeMessage('Save') },
  ])(
    'preserves the complete $locale catalog and server time zone',
    ({ locale, save }) => {
      const onMessages = vi.fn();
      render(
        <AppIntlProvider locale={locale} timeZone="UTC">
          <LocaleProbe onMessages={onMessages} />
        </AppIntlProvider>,
      );

      expect(screen.getByText(save)).toBeTruthy();
      expect(screen.getByText('UTC')).toBeTruthy();
      expect(onMessages).toHaveBeenCalledWith(loadMessages(locale));
    },
  );

  it('keeps the catalog stable across renders and replaces it on locale changes', () => {
    const onMessages = vi.fn();
    const view = render(
      <AppIntlProvider locale={DEFAULT_LOCALE} timeZone="UTC">
        <LocaleProbe onMessages={onMessages} />
      </AppIntlProvider>,
    );
    const firstMessages = onMessages.mock.calls.at(-1)?.[0];

    view.rerender(
      <AppIntlProvider locale={DEFAULT_LOCALE} timeZone="UTC">
        <LocaleProbe onMessages={onMessages} />
      </AppIntlProvider>,
    );
    expect(onMessages.mock.calls.at(-1)?.[0]).toBe(firstMessages);

    view.rerender(
      <AppIntlProvider locale={PSEUDO_LOCALE} timeZone="UTC">
        <LocaleProbe onMessages={onMessages} />
      </AppIntlProvider>,
    );
    expect(onMessages.mock.calls.at(-1)?.[0]).not.toBe(firstMessages);
    expect(onMessages.mock.calls.at(-1)?.[0]).toEqual(
      loadMessages(PSEUDO_LOCALE),
    );
    expect(screen.getByText(pseudoLocalizeMessage('Save'))).toBeTruthy();
  });
});
