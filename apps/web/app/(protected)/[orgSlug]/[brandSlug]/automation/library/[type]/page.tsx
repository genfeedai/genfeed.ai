import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AutomationLibraryTypeRoute from './AutomationLibraryTypeRoute';

export const generateMetadata = createPageMetadata('Agent Library');

export default function AutomationLibraryTypePage() {
  return <AutomationLibraryTypeRoute />;
}
