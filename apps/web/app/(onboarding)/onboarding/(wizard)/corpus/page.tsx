import CorpusContent from '@app/(onboarding)/onboarding/(wizard)/corpus/corpus-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Corpus');

export default function CorpusPage() {
  return <CorpusContent />;
}
