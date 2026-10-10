import { stringifyJsonLd } from '@data/json-ld';
import ServiceLandingPage from '@web-components/landing/ServiceLandingPage';
import { createServiceLandingMetadata } from '@web-components/landing/service-landing-metadata';
import {
  type ServiceLandingConfig,
  serviceLandingConfigBySlug,
} from '@web-components/landing/service-landings.data';
import { buildDoneForYouJsonLd } from '@web-components/landing/service-offering-jsonld';

const config = serviceLandingConfigBySlug[
  'done-for-you'
] as ServiceLandingConfig;

export const metadata = createServiceLandingMetadata(config);

export default function DoneForYouPage() {
  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(buildDoneForYouJsonLd())}
      </script>
      <ServiceLandingPage slug="done-for-you" />
    </>
  );
}
