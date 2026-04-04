import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AgenciesContent from '@public/agencies/agencies-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'For Agencies',
  'Scale content production 10x. Give every client the content volume of an in-house team. AI-powered video, image, and copy generation for agencies.',
  '/agencies',
);

export default function Agencies() {
  return <AgenciesContent />;
}
