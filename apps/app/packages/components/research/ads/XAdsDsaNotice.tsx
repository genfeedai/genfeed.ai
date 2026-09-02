'use client';

import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function XAdsDsaNotice() {
  const translate = useTranslations('pages.adsResearch.dsaNotice');

  return (
    <div className="px-5 pt-5 sm:px-6 sm:pt-6">
      <Alert variant="info">
        <Info aria-hidden="true" className="size-4" />
        <AlertTitle className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{translate('badge')}</Badge>
          {translate('title')}
        </AlertTitle>
        <AlertDescription>{translate('description')}</AlertDescription>
      </Alert>
    </div>
  );
}
