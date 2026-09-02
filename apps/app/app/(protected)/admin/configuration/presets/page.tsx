import { PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PresetsList from './presets-list';

export const generateMetadata = createPageMetadata('Presets');

export default function PresetsPage() {
  return <PresetsList scope={PageScope.SUPERADMIN} />;
}
