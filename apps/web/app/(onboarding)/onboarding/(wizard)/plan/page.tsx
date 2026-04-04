import PlanContent from '@app/(onboarding)/onboarding/(wizard)/plan/plan-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Choose Plan');

export default function PlanPage() {
  return <PlanContent />;
}
