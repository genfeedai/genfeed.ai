import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AvatarTwinWizard from '@/features/avatar-twins/avatar-twin-wizard';

export const generateMetadata = createPageMetadata('Digital twin');

export default function LibraryAvatarTwinPage() {
  return <AvatarTwinWizard />;
}
