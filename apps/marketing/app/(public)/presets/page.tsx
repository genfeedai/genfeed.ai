import { stringifyJsonLd } from '@data/json-ld';
import {
  buildPresetsHubJsonLd,
  getPresetPages,
  hasPresetPages,
} from '@data/presets.data';
import PresetsContent from '@public/presets/presets-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';
import { notFound } from 'next/navigation';

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Content Presets With Real Examples',
  'Browse Genfeed presets for video ads, business content, videos, images and photo edits. Each shows a real example, the full recipe to copy and how to run it.',
  '/presets',
);

export default function PresetsPage(): React.ReactElement {
  if (!hasPresetPages()) {
    notFound();
  }

  const pages = getPresetPages();

  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(buildPresetsHubJsonLd(pages))}
      </script>
      <PresetsContent pages={pages} />
    </>
  );
}
