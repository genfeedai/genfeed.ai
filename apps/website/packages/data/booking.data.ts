/**
 * Calls are booked in one place on the website: the done-for-you page. Every
 * other "Book a call" links here, so the visitor reads what the engagement is
 * before picking a slot and every booking is counted on one page.
 */
export const BOOKING_PAGE_SLUG = 'done-for-you';
export const BOOKING_SECTION_ID = 'book';
export const BOOKING_HREF = `/${BOOKING_PAGE_SLUG}#${BOOKING_SECTION_ID}`;

const CALENDLY_ORIGIN = 'https://calendly.com';
const WEBSITE_HOST = 'genfeed.ai';

/**
 * Calendly's inline embed. `embed_domain` makes Calendly post booking events
 * to this page; the colours match the dark-only marketing site.
 */
export function buildCalendlyEmbedUrl(calendlyUrl: string): string {
  const url = new URL(calendlyUrl);
  url.searchParams.set('embed_domain', WEBSITE_HOST);
  url.searchParams.set('embed_type', 'Inline');
  url.searchParams.set('hide_gdpr_banner', '1');
  url.searchParams.set('background_color', '000000');
  url.searchParams.set('text_color', 'ffffff');
  url.searchParams.set('primary_color', 'ffffff');
  return url.toString();
}

/** True for Calendly's postMessage fired when a visitor confirms a slot. */
export function isCalendlyBookingMessage(event: MessageEvent): boolean {
  if (event.origin !== CALENDLY_ORIGIN) {
    return false;
  }

  const data: unknown = event.data;
  return (
    typeof data === 'object' &&
    data !== null &&
    'event' in data &&
    data.event === 'calendly.event_scheduled'
  );
}
