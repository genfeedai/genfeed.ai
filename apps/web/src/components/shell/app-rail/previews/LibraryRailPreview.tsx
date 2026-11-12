'use client';

import { useTranslations } from 'next-intl';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import MediaRailPreview from './MediaRailPreview';

/** Library: the newest assets of the brand. */
export default function LibraryRailPreview({
  href,
}: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.library');

  return (
    <MediaRailPreview
      emptyLabel={translate('empty')}
      href={href}
      queryScope="library"
      title={translate('title')}
    />
  );
}
