import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandSettingsInterviewPage from './content';

export const generateMetadata = createPageMetadata('Brand Interview');

export default function BrandSettingsInterviewRoute() {
  return <BrandSettingsInterviewPage />;
}
