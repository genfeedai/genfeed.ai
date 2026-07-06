import { stringifyJsonLd } from '@data/json-ld';
import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import CaseStudiesContent from '@public/case-studies/case-studies-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Case Studies',
  'The Genfeed consent-first process for turning early customer outcomes into case studies, testimonials, and public proof slots.',
  '/case-studies',
);

const caseStudiesJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  description:
    'A public-safe proof pipeline for Genfeed case studies, testimonials, and social proof slots.',
  name: 'Genfeed Case Studies',
  url: 'https://genfeed.ai/case-studies',
};

export default function CaseStudiesPage() {
  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(caseStudiesJsonLd)}
      </script>
      <CaseStudiesContent />
    </>
  );
}
