import { pitchLandingConfigBySlug } from '@web-components/landing/pitch-pages.data';
import ServiceLandingPage from '@web-components/landing/ServiceLandingPage';
import { createServiceLandingMetadata } from '@web-components/landing/service-landing-metadata';
import type { ServiceLandingConfig } from '@web-components/landing/service-landings.data';

const config = pitchLandingConfigBySlug.dfy as ServiceLandingConfig;

export const metadata = createServiceLandingMetadata(config);

export default function DfyPage() {
  return <ServiceLandingPage slug="dfy" />;
}
