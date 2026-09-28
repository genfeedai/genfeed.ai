import { describe, expect, it } from 'vitest';
import {
  BOOKING_HREF,
  buildCalendlyEmbedUrl,
  isCalendlyBookingMessage,
} from './booking.data';

describe('booking data', () => {
  it('books every call on the done-for-you page', () => {
    expect(BOOKING_HREF).toBe('/done-for-you#book');
  });

  it('builds a dark inline embed that reports bookings back to the site', () => {
    const url = new URL(
      buildCalendlyEmbedUrl('https://calendly.com/vincent-genfeed/30min'),
    );

    expect(url.origin + url.pathname).toBe(
      'https://calendly.com/vincent-genfeed/30min',
    );
    expect(url.searchParams.get('embed_domain')).toBe('genfeed.ai');
    expect(url.searchParams.get('embed_type')).toBe('Inline');
    expect(url.searchParams.get('background_color')).toBe('000000');
  });

  it('only counts a scheduled event posted by Calendly', () => {
    const scheduled = { event: 'calendly.event_scheduled' };

    expect(
      isCalendlyBookingMessage(
        new MessageEvent('message', {
          data: scheduled,
          origin: 'https://calendly.com',
        }),
      ),
    ).toBe(true);
    expect(
      isCalendlyBookingMessage(
        new MessageEvent('message', {
          data: scheduled,
          origin: 'https://evil.example',
        }),
      ),
    ).toBe(false);
    expect(
      isCalendlyBookingMessage(
        new MessageEvent('message', {
          data: { event: 'calendly.page_height' },
          origin: 'https://calendly.com',
        }),
      ),
    ).toBe(false);
  });
});
