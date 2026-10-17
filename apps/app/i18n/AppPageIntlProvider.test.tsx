import {
  type AppLocale,
  DEFAULT_LOCALE,
  PSEUDO_LOCALE,
} from '@genfeedai/contracts/constants';
import { cleanup, render, screen } from '@testing-library/react';
import {
  NextIntlClientProvider,
  useLocale,
  useMessages,
  useTimeZone,
  useTranslations,
} from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import pages from '../messages/en/pages.json';
import AppPageIntlProvider from './AppPageIntlProvider';
import { loadMessages } from './messages';
import { pseudoLocalizeMessage } from './pseudo';

interface ProbeProps {
  onMessages: (messages: ReturnType<typeof useMessages>) => void;
}

interface ParentProviderProps {
  children: ReactNode;
  locale?: AppLocale;
  onError?: (error: Error) => void;
}

const LIBRARY_MESSAGES = { library: pages.library };
const TIME_ZONE = 'America/New_York';
const ENGLISH = loadMessages(DEFAULT_LOCALE);
const PSEUDO = loadMessages(PSEUDO_LOCALE);
const PARENT_MESSAGES = {
  [DEFAULT_LOCALE]: {
    common: ENGLISH.common,
    pages: {
      analytics: {
        metricDefinitionLabel: ENGLISH.pages.analytics.metricDefinitionLabel,
        metricLabels: ENGLISH.pages.analytics.metricLabels,
      },
      help: ENGLISH.pages.help,
    },
  },
  [PSEUDO_LOCALE]: {
    common: PSEUDO.common,
    pages: {
      analytics: {
        metricDefinitionLabel: PSEUDO.pages.analytics.metricDefinitionLabel,
        metricLabels: PSEUDO.pages.analytics.metricLabels,
      },
      help: PSEUDO.pages.help,
    },
  },
};

function ParentProvider({
  children,
  locale = DEFAULT_LOCALE,
  onError,
}: ParentProviderProps) {
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone={TIME_ZONE}
      messages={PARENT_MESSAGES[locale]}
      onError={onError}
    >
      {children}
    </NextIntlClientProvider>
  );
}

function LibraryProbe({ onMessages }: ProbeProps) {
  onMessages(useMessages());
  const common = useTranslations('common.actions');
  const help = useTranslations('pages.help');
  const library = useTranslations('pages.library');
  const locale = useLocale();
  const timeZone = useTimeZone();

  return (
    <>
      <span>{common('save')}</span>
      <span>{help('workspaceOverview.title')}</span>
      <span>{library('emptyOpenPlayground')}</span>
      <span>{locale}</span>
      <span>{timeZone}</span>
    </>
  );
}

function MetricProbe({ onMessages }: ProbeProps) {
  onMessages(useMessages());
  const analytics = useTranslations('pages.analytics');
  return <span>{analytics('metricDefinitionLabel')}</span>;
}

describe('AppPageIntlProvider', () => {
  afterEach(cleanup);

  it('adds only the selected pages and inherits the shell, locale and time zone', () => {
    const onMessages = vi.fn();
    const onError = vi.fn();
    render(
      <ParentProvider onError={onError}>
        <AppPageIntlProvider pages={LIBRARY_MESSAGES}>
          <LibraryProbe onMessages={onMessages} />
        </AppPageIntlProvider>
      </ParentProvider>,
    );

    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText(pages.help.workspaceOverview.title)).toBeTruthy();
    expect(screen.getByText(pages.library.emptyOpenPlayground)).toBeTruthy();
    expect(screen.getByText(DEFAULT_LOCALE)).toBeTruthy();
    expect(screen.getByText(TIME_ZONE)).toBeTruthy();
    const messages = onMessages.mock.calls.at(-1)?.[0];
    expect(Object.keys(messages.pages).sort()).toEqual([
      'analytics',
      'help',
      'library',
    ]);
    expect(messages.pages).not.toHaveProperty('adminFlags');
    expect(messages.pages).not.toHaveProperty('workflows');
    expect(onError).not.toHaveBeenCalled();
  });

  it('merges a partial namespace without dropping inherited nested keys', () => {
    const onMessages = vi.fn();
    const onError = vi.fn();
    render(
      <ParentProvider onError={onError}>
        <AppPageIntlProvider
          pages={{ analytics: { metricDefinitionLabel: 'Selected metric' } }}
        >
          <MetricProbe onMessages={onMessages} />
        </AppPageIntlProvider>
      </ParentProvider>,
    );

    expect(screen.getByText('Selected metric')).toBeTruthy();
    expect(
      onMessages.mock.calls.at(-1)?.[0].pages.analytics.metricLabels,
    ).toEqual(pages.analytics.metricLabels);
    expect(ENGLISH.pages.analytics.metricDefinitionLabel).toBe(
      pages.analytics.metricDefinitionLabel,
    );
    expect(PARENT_MESSAGES.en.pages.analytics.metricDefinitionLabel).toBe(
      pages.analytics.metricDefinitionLabel,
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('pseudo-localizes the new slice once while preserving the inherited pseudo catalog', () => {
    const onMessages = vi.fn();
    const onError = vi.fn();
    render(
      <ParentProvider locale={PSEUDO_LOCALE} onError={onError}>
        <AppPageIntlProvider pages={LIBRARY_MESSAGES}>
          <LibraryProbe onMessages={onMessages} />
        </AppPageIntlProvider>
      </ParentProvider>,
    );

    expect(screen.getByText(pseudoLocalizeMessage('Save'))).toBeTruthy();
    expect(
      screen.getByText(
        pseudoLocalizeMessage(pages.help.workspaceOverview.title),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        pseudoLocalizeMessage(pages.library.emptyOpenPlayground),
      ),
    ).toBeTruthy();
    expect(onMessages.mock.calls.at(-1)?.[0].pages.library).toEqual(
      PSEUDO.pages.library,
    );
    expect(pages.library.emptyOpenPlayground).toBe(
      ENGLISH.pages.library.emptyOpenPlayground,
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps messages stable on rerender and refreshes the slice on a locale change', () => {
    const onMessages = vi.fn();
    const onError = vi.fn();
    const tree = (locale: AppLocale) => (
      <ParentProvider locale={locale} onError={onError}>
        <AppPageIntlProvider pages={LIBRARY_MESSAGES}>
          <LibraryProbe onMessages={onMessages} />
        </AppPageIntlProvider>
      </ParentProvider>
    );
    const view = render(tree(DEFAULT_LOCALE));
    const firstMessages = onMessages.mock.calls.at(-1)?.[0];

    view.rerender(tree(DEFAULT_LOCALE));
    expect(onMessages.mock.calls.at(-1)?.[0]).toBe(firstMessages);

    view.rerender(tree(PSEUDO_LOCALE));
    expect(onMessages.mock.calls.at(-1)?.[0]).not.toBe(firstMessages);
    expect(
      screen.getByText(
        pseudoLocalizeMessage(pages.library.emptyOpenPlayground),
      ),
    ).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });

  it('detects a missing product slice in the real next-intl harness', () => {
    const onError = vi.fn();
    render(
      <ParentProvider onError={onError}>
        <LibraryProbe onMessages={vi.fn()} />
      </ParentProvider>,
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MISSING_MESSAGE' }),
    );
  });
});
