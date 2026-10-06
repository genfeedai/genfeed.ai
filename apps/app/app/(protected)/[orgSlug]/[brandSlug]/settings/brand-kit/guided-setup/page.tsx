import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandSettingsInterviewPage from './content';

export const generateMetadata = createPageMetadata('Guided setup');

export default function BrandSettingsInterviewRoute() {
  return <BrandSettingsInterviewPage />;
}
