'use client';

import { PSEUDO_LOCALE } from '@genfeedai/contracts/constants';
import type { PageIntlProviderProps } from '@genfeedai/props/providers/intl-provider.props';
import {
  NextIntlClientProvider,
  useLocale,
  useMessages,
  useTimeZone,
} from 'next-intl';
import { useMemo } from 'react';
import { mergeMessageTrees } from './message-tree';
import { pseudoLocalizeMessages } from './pseudo';

export default function AppPageIntlProvider({
  children,
  pages,
}: PageIntlProviderProps) {
  const inherited = useMessages();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const messages = useMemo(
    () =>
      mergeMessageTrees(inherited, {
        pages: locale === PSEUDO_LOCALE ? pseudoLocalizeMessages(pages) : pages,
      }),
    [inherited, locale, pages],
  );
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone={timeZone}
      messages={messages}
    >
      {children}
    </NextIntlClientProvider>
  );
}
