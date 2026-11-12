'use client';

import { IngredientCategory } from '@genfeedai/contracts';
import { useTranslations } from 'next-intl';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import MediaRailPreview from './MediaRailPreview';

const PLAYGROUND_CATEGORIES = [
  IngredientCategory.IMAGE,
  IngredientCategory.VIDEO,
];

/** Playground: the newest generated images and videos. */
export default function PlaygroundRailPreview({
  href,
}: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.playground');

  return (
    <MediaRailPreview
      categories={PLAYGROUND_CATEGORIES}
      emptyLabel={translate('empty')}
      href={href}
      queryScope="playground"
      title={translate('title')}
    />
  );
}
