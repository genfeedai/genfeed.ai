import FirstSystemContent from '@app/(onboarding)/onboarding/(wizard)/first-system/first-system-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('First content system');

export default function FirstSystemPage() {
  return <FirstSystemContent />;
}
