'use client';

import type { PageHelpContent } from '@genfeedai/props/ui/layout/page-help.props';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { resolvePageHelpKey } from '@/config/page-help.config';

/** Route-level "About this page" copy for the protected shell. */
export function usePageHelp(pathname: string): PageHelpContent | null {
  const translate = useTranslations('pages.help');
  const search = useSearchParams()?.toString() ?? '';
  return useMemo(() => {
    const key = resolvePageHelpKey(pathname, search);
    if (!key) return null;
    return {
      body: translate(`${key}.body`),
      title: translate(`${key}.title`),
    };
  }, [pathname, search, translate]);
}
