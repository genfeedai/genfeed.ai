import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ScenesList from './scenes-list';

export const generateMetadata = createPageMetadata('Scenes Settings');

export default function SettingsScenesPage() {
  return <ScenesList />;
}
