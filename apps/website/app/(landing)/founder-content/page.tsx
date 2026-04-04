import ServiceLandingPage from '@web-components/landing/ServiceLandingPage';
import { createServiceLandingMetadata } from '@web-components/landing/service-landing-metadata';
import {
  type ServiceLandingConfig,
  serviceLandingConfigBySlug,
} from '@web-components/landing/service-landings.data';

const config = serviceLandingConfigBySlug[
  'founder-content'
] as ServiceLandingConfig;

export const metadata = createServiceLandingMetadata(config);

export default function FounderContentPage() {
  return <ServiceLandingPage config={config} />;
}
