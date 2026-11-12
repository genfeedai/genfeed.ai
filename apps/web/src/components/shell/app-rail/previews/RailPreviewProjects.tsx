'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useTranslations } from 'next-intl';
import type { AppRailPreviewProjectsProps } from '@/props/ui/app-rail-preview.props';
import {
  RailPreviewItems,
  RailPreviewSection,
  RailPreviewState,
} from './rail-preview-parts';

/**
 * The body every project-style preview (Storyboard, Turbo, Motion, Clipper,
 * Editor) shares: the brand's recent projects, drawn like the app's own list.
 */
export default function RailPreviewProjects({
  isError,
  isLoading,
  items,
  translationKey,
}: AppRailPreviewProjectsProps) {
  const translate = useTranslations('common.appRail.preview');
  const { brandId } = useBrand();
  const emptyKey = brandId ? 'projects.empty' : 'projects.selectBrand';

  return (
    <RailPreviewSection title={translate('projects.title')}>
      <RailPreviewState
        emptyLabel={translate(emptyKey, {
          app: translate(`apps.${translationKey}`),
        })}
        isEmpty={!brandId || items.length === 0}
        isError={brandId ? isError : false}
        isLoading={brandId ? isLoading : false}
      >
        <RailPreviewItems items={items} />
      </RailPreviewState>
    </RailPreviewSection>
  );
}
