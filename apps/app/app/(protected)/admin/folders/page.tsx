import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FoldersList from './folders-list';

export const generateMetadata = createPageMetadata('Folders');

export default function FoldersPage() {
  return <FoldersList scope={PageScope.SUPERADMIN} />;
}
