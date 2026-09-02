'use client';

import type { ActivityMessageFormatter } from '@genfeedai/contracts';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/** Resolve shared activity descriptors through the app message catalog. */
export function useActivityMessageFormatter(): ActivityMessageFormatter {
  const translate = useTranslations('common');

  return useCallback(
    (descriptor) => translate(descriptor.id, descriptor.params),
    [translate],
  );
}
