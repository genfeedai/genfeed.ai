import { DEFAULT_LOCALE, PSEUDO_LOCALE } from '@genfeedai/contracts/constants';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { act, render, screen } from '@testing-library/react';
import {
  type DateTimeFormatOptions,
  NextIntlClientProvider,
  useFormatter,
  useMessages,
  useTimeZone,
  useTranslations,
} from 'next-intl';
import type { ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppIntlProvider from './AppIntlProvider';
import { loadMessages } from './messages';
import { pseudoLocalizeMessage } from './pseudo';

interface LocaleProbeProps {
  onMessages: (messages: ReturnType<typeof useMessages>) => void;
}

interface NaiveIntlProviderProps {
  children: ReactNode;
}

const VIEWER_TIME_ZONE = 'America/New_York';
// 03:30 UTC on Jan 15 is still the evening of Jan 14 in New York, so the date
// and the hour both differ between the two zones.
const PUBLISHED_AT = new Date('2026-01-15T03:30:00Z');
const DATE_TIME_OPTIONS: DateTimeFormatOptions = {
  day: 'numeric',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  month: 'short',
  year: 'numeric',
};

function formatIn(timeZone: string): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    ...DATE_TIME_OPTIONS,
    timeZone,
  }).format(PUBLISHED_AT);
}

function mockBrowserTimeZone(timeZone: string | undefined) {
  const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;

  return vi
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockImplementation(function (this: Intl.DateTimeFormat) {
      return Object.assign(resolvedOptions.call(this), { timeZone });
    });
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

function PublishedAtProbe() {
  const format = useFormatter();

  return (
    <span data-testid="published-at">
      {format.dateTime(PUBLISHED_AT, DATE_TIME_OPTIONS)}
    </span>
  );
}

/** Reads the browser zone during render, which is what must never ship. */
function NaiveIntlProvider({ children }: NaiveIntlProviderProps) {
  return (
    <NextIntlClientProvider
      locale={DEFAULT_LOCALE}
      messages={loadMessages(DEFAULT_LOCALE)}
      timeZone={getBrowserTimezone()}
    >
      {children}
    </NextIntlClientProvider>
  );
}

async function hydrateServerHtml(tree: ReactNode) {
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.append(container);
  const serverText = container.textContent;

  const onRecoverableError = vi.fn();
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, { onRecoverableError });
  });

  return { container, onRecoverableError, root, serverText };
}

describe('AppIntlProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it.each([
    { locale: DEFAULT_LOCALE, save: 'Save' },
    { locale: PSEUDO_LOCALE, save: pseudoLocalizeMessage('Save') },
  ])(
    'preserves the complete $locale catalog and uses the viewer time zone',
    ({ locale, save }) => {
      mockBrowserTimeZone(VIEWER_TIME_ZONE);
      const onMessages = vi.fn();
      render(
        <AppIntlProvider locale={locale}>
          <LocaleProbe onMessages={onMessages} />
        </AppIntlProvider>,
      );

      expect(screen.getByText(save)).toBeTruthy();
      expect(screen.getByText(VIEWER_TIME_ZONE)).toBeTruthy();
      expect(onMessages).toHaveBeenCalledWith(loadMessages(locale));
    },
  );

  it('formats dates in the viewer time zone, not the server one', () => {
    mockBrowserTimeZone(VIEWER_TIME_ZONE);
    render(
      <AppIntlProvider locale={DEFAULT_LOCALE}>
        <PublishedAtProbe />
      </AppIntlProvider>,
    );

    expect(screen.getByTestId('published-at').textContent).toBe(
      formatIn(VIEWER_TIME_ZONE),
    );
    expect(formatIn(VIEWER_TIME_ZONE)).not.toBe(formatIn('UTC'));
  });

  it('falls back to UTC when the browser reports no usable time zone', () => {
    mockBrowserTimeZone(undefined);
    render(
      <AppIntlProvider locale={DEFAULT_LOCALE}>
        <PublishedAtProbe />
      </AppIntlProvider>,
    );

    expect(screen.getByTestId('published-at').textContent).toBe(
      formatIn('UTC'),
    );
  });

  it('hydrates server HTML in another zone without a mismatch, then shows the viewer zone', async () => {
    mockBrowserTimeZone(VIEWER_TIME_ZONE);
    const tree = (
      <AppIntlProvider locale={DEFAULT_LOCALE}>
        <PublishedAtProbe />
      </AppIntlProvider>
    );

    const { container, onRecoverableError, root, serverText } =
      await hydrateServerHtml(tree);

    expect(serverText).toBe(formatIn('UTC'));
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toBe(formatIn(VIEWER_TIME_ZONE));

    await act(async () => root.unmount());
  });

  // Control: proves the harness above detects a zone mismatch, so its passing
  // result means something.
  it('detects the mismatch when a provider reads the browser zone during render', async () => {
    const tree = (
      <NaiveIntlProvider>
        <PublishedAtProbe />
      </NaiveIntlProvider>
    );
    const container = document.createElement('div');
    mockBrowserTimeZone('UTC');
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    vi.restoreAllMocks();
    mockBrowserTimeZone(VIEWER_TIME_ZONE);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const onRecoverableError = vi.fn();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError });
    });

    expect(onRecoverableError).toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('keeps the catalog stable across renders and replaces it on locale changes', () => {
    const onMessages = vi.fn();
    const view = render(
      <AppIntlProvider locale={DEFAULT_LOCALE}>
        <LocaleProbe onMessages={onMessages} />
      </AppIntlProvider>,
    );
    const firstMessages = onMessages.mock.calls.at(-1)?.[0];

    view.rerender(
      <AppIntlProvider locale={DEFAULT_LOCALE}>
        <LocaleProbe onMessages={onMessages} />
      </AppIntlProvider>,
    );
    expect(onMessages.mock.calls.at(-1)?.[0]).toBe(firstMessages);

    view.rerender(
      <AppIntlProvider locale={PSEUDO_LOCALE}>
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
