import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FontFamiliesList from './font-families-list';

export const generateMetadata = createPageMetadata('Font Families');

export default function FontFamiliesPage() {
  return <FontFamiliesList scope={PageScope.SUPERADMIN} />;
}
