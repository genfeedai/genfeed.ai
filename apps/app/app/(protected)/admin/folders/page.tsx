import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import FoldersList from './folders-list';

export const generateMetadata = createPageMetadata('Folders');

export default function FoldersPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <FoldersList scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
