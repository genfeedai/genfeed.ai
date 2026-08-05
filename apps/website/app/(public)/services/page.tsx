import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import ServicesContent from '@public/services/services-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Content Services, Done For You',
  'Professional content services. Done-for-you content, training, and content consultancy for agencies and brands.',
  '/services',
);

export default function Services() {
  return <ServicesContent />;
}
