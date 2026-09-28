'use client';

import {
  BOOKING_SECTION_ID,
  buildCalendlyEmbedUrl,
  isCalendlyBookingMessage,
} from '@data/booking.data';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { WebSection } from '@web-components/content/NeuralGrid';
import { useEffect } from 'react';
import { WEBSITE_ANALYTICS_EVENTS } from '../../analytics/analytics-events';
import { captureWebsiteAnalyticsEvent } from '../../analytics/posthog-client';

/*
  The website's one booking surface. The calendar sits on the page instead of
  behind a link: the visitor has just read what the engagement is, so the next
  step is picking a slot, not a second tab. A confirmed slot is counted as its
  own event, separate from clicks toward this section.
*/
export default function BookingSection(): React.ReactElement {
  useEffect(() => {
    const controller = new AbortController();

    window.addEventListener(
      'message',
      (event: MessageEvent) => {
        if (isCalendlyBookingMessage(event)) {
          captureWebsiteAnalyticsEvent(WEBSITE_ANALYTICS_EVENTS.CALL_BOOKED, {
            surface: 'done_for_you',
          });
        }
      },
      { signal: controller.signal },
    );

    return () => controller.abort();
  }, []);

  return (
    <WebSection
      bg="bordered"
      className="scroll-mt-20"
      id={BOOKING_SECTION_ID}
      maxWidth="lg"
    >
      <SectionHeader
        title="Book a call"
        description="30 minutes on your channels, output target, and fit. If done-for-you makes sense, we scope it on the call. If it does not, you leave with a plan you can run yourself on Genfeed."
        className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
      />

      <iframe
        className="h-[760px] w-full border border-edge/10 bg-background"
        loading="lazy"
        src={buildCalendlyEmbedUrl(EnvironmentService.calendly)}
        title="Book a call with Genfeed"
      />

      <p className="mt-4 text-center text-sm text-surface/60">
        Calendar not loading?{' '}
        <a
          className="underline underline-offset-4 hover:text-surface"
          href={EnvironmentService.calendly}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open it in a new tab
        </a>
        .
      </p>
    </WebSection>
  );
}
