import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandSettingsHarnessPage from './content';

export const generateMetadata = createPageMetadata('Brand harness');

export default function BrandSettingsHarnessRoute() {
  return <BrandSettingsHarnessPage />;
}
