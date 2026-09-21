import PositioningContent from '@app/(onboarding)/onboarding/(wizard)/positioning/positioning-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Positioning');

export default function PositioningPage() {
  return <PositioningContent />;
}
