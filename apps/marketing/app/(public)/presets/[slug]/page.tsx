import { stringifyJsonLd } from '@data/json-ld';
import {
  buildPresetPageJsonLd,
  getAllPresetSlugs,
  getPresetPageBySlug,
  getRelatedPresetPages,
} from '@data/presets.data';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PresetContent from '@public/presets/preset-content';
import { withMarketingOgMetadata } from '@web-components/og/marketing-metadata';
import { notFound } from 'next/navigation';

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return getAllPresetSlugs().map((slug) => ({ slug }));
}

const generate = createDynamicPageMetadata(
  'slug',
  (slug) => getPresetPageBySlug(slug)?.seoTitle ?? 'Preset',
  (slug) => `/presets/${slug}`,
  (slug) => getPresetPageBySlug(slug)?.seoDescription ?? '',
);

export async function generateMetadata(...args: Parameters<typeof generate>) {
  const { slug } = await args[0].params;
  return withMarketingOgMetadata(
    await generate(...args),
    `/presets/${slug}`,
    getPresetPageBySlug(slug)?.seoTitle ?? 'Preset',
  );
}

export default async function PresetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const page = getPresetPageBySlug(slug);

  if (!page) {
    notFound();
  }

  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(buildPresetPageJsonLd(page))}
      </script>
      <PresetContent page={page} related={getRelatedPresetPages(page)} />
    </>
  );
}
