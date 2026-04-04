import SuccessContent from '@app/(onboarding)/onboarding/(wizard)/success/success-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Welcome');

export default function SuccessPage() {
  return <SuccessContent />;
}
