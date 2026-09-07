'use client';

import { resolvePageHelpKey } from '@app-config/page-help.config';
import type { PageHelpContent } from '@genfeedai/props/ui/layout/page-help.props';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

/** Route-level "About this page" copy for the protected shell. */
export function usePageHelp(pathname: string): PageHelpContent | null {
  const translate = useTranslations('pages.help');
  return useMemo(() => {
    const key = resolvePageHelpKey(pathname);
    if (!key) return null;
    return {
      body: translate(`${key}.body`),
      title: translate(`${key}.title`),
    };
  }, [pathname, translate]);
}
