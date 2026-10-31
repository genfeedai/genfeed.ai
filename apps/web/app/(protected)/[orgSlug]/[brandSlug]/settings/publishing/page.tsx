import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandSettingsPublishingPage from './content';

export const generateMetadata = createPageMetadata('Brand Publishing');

export default function BrandSettingsPublishingRoute() {
  return <BrandSettingsPublishingPage />;
}
