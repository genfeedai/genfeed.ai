import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TurboWorkspace from '@/features/workflows/pages/turbo/TurboWorkspace';
export const generateMetadata = createPageMetadata('Turbo');
export default function StudioTurboPage() {
  return <TurboWorkspace />;
}
