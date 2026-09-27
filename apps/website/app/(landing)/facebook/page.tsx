import ServiceLandingPage from '@web-components/landing/ServiceLandingPage';
import { createServiceLandingMetadata } from '@web-components/landing/service-landing-metadata';
import {
  type ServiceLandingConfig,
  serviceLandingConfigBySlug,
} from '@web-components/landing/service-landings.data';

const config = serviceLandingConfigBySlug.facebook as ServiceLandingConfig;

export const metadata = createServiceLandingMetadata(config);

export default function FacebookGrowthPage() {
  return <ServiceLandingPage slug="facebook" />;
}
