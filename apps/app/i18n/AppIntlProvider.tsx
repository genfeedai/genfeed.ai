'use client';

import type { AppLocale } from '@genfeedai/contracts/constants';
import { useViewerTimeZone } from '@hooks/ui/use-viewer-time-zone/use-viewer-time-zone';
import { NextIntlClientProvider } from 'next-intl';
import { type ReactNode, useMemo } from 'react';
import { loadMessages } from './messages';

interface AppIntlProviderProps {
  children: ReactNode;
  locale: AppLocale;
}

/**
 * Dates format in the viewer's own time zone. The root layout stays
 * request-free, so the server cannot know that zone: server HTML and the
 * hydrating render share a fixed zone and the viewer's zone applies right
 * after hydration (see `useViewerTimeZone`).
 */
export default function AppIntlProvider({
  children,
  locale,
}: AppIntlProviderProps) {
  const messages = useMemo(() => loadMessages(locale), [locale]);
  const timeZone = useViewerTimeZone();

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}
