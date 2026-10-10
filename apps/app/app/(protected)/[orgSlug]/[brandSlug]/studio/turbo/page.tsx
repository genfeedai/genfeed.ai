import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TurboProjectsPage from '@/features/workflows/pages/turbo/TurboProjectsPage';
export const generateMetadata = createPageMetadata('TurboRun');
export default function StudioTurboPage() {
  return <TurboProjectsPage />;
}
