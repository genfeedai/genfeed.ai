import {
  buildDevelopersJsonLd,
  DEVELOPERS_DESCRIPTION,
  DEVELOPERS_PATH,
  DEVELOPERS_TITLE,
} from '@data/developers.data';
import { stringifyJsonLd } from '@data/json-ld';
import DevelopersContent from '@public/developers/developers-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  DEVELOPERS_TITLE,
  DEVELOPERS_DESCRIPTION,
  DEVELOPERS_PATH,
);

export default function DevelopersPage() {
  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(buildDevelopersJsonLd())}
      </script>
      <DevelopersContent />
    </>
  );
}
