import ProvidersContent from '@app/(onboarding)/onboarding/(wizard)/providers/providers-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Configure Providers');

export default function ProvidersPage() {
  return <ProvidersContent />;
}
