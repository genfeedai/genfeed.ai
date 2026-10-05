'use client';

import type { AppLocale } from '@genfeedai/contracts/constants';
import { NextIntlClientProvider } from 'next-intl';
import { type ReactNode, useMemo } from 'react';
import { loadMessages } from './messages';

interface AppIntlProviderProps {
  children: ReactNode;
  locale: AppLocale;
  timeZone: string;
}

export default function AppIntlProvider({
  children,
  locale,
  timeZone,
}: AppIntlProviderProps) {
  const messages = useMemo(() => loadMessages(locale), [locale]);

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
