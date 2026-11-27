import PlansContent from '@app/(onboarding)/onboarding/(wizard)/plans/plans-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Pick your plan');

export default function PlansPage() {
  return <PlansContent />;
}
