# Website Marketing Tracking

The website owns one canonical marketing event layer in `apps/website/packages/marketing`.

## Event Contract

Browser-only events:

- `page_view`
- `view_pricing`
- `cta_click`
- `start_signup`

Browser + server events with shared `eventId` for dedupe:

- `book_call`
- `lead_submit`
- `signup_complete`

`ButtonTracked` keeps the existing Vercel Analytics event and also emits a `genfeed:marketing:button-click` browser event. The website provider maps CTA actions such as `book_demo`, `view_plans`, and `core_cta` onto the canonical event names.

## Consent

`NEXT_PUBLIC_MARKETING_CONSENT_DEFAULT=denied` is the default. GTM, GA4, Meta Pixel, LinkedIn Insight Tag, and X Pixel are not loaded until the visitor grants marketing consent. Consent is stored in `localStorage` under `genfeed:marketing-consent`.

## Environment

Public browser config:

- `NEXT_PUBLIC_GA_ID`
- `NEXT_PUBLIC_GTM_CONTAINER_ID`
- `NEXT_PUBLIC_META_PIXEL_ID`
- `NEXT_PUBLIC_LINKEDIN_PARTNER_ID`
- `NEXT_PUBLIC_LINKEDIN_CONVERSION_ID_BOOK_CALL`
- `NEXT_PUBLIC_LINKEDIN_CONVERSION_ID_CTA_CLICK`
- `NEXT_PUBLIC_LINKEDIN_CONVERSION_ID_LEAD_SUBMIT`
- `NEXT_PUBLIC_LINKEDIN_CONVERSION_ID_SIGNUP_COMPLETE`
- `NEXT_PUBLIC_LINKEDIN_CONVERSION_ID_START_SIGNUP`
- `NEXT_PUBLIC_LINKEDIN_CONVERSION_ID_VIEW_PRICING`
- `NEXT_PUBLIC_X_PIXEL_ID`
- `NEXT_PUBLIC_X_BOOK_CALL_EVENT_ID`
- `NEXT_PUBLIC_X_CTA_CLICK_EVENT_ID`
- `NEXT_PUBLIC_X_LEAD_SUBMIT_EVENT_ID`
- `NEXT_PUBLIC_X_SIGNUP_COMPLETE_EVENT_ID`
- `NEXT_PUBLIC_X_START_SIGNUP_EVENT_ID`
- `NEXT_PUBLIC_X_VIEW_PRICING_EVENT_ID`

Server conversion config:

- `LINKEDIN_CONVERSIONS_API_ACCESS_TOKEN`
- `LINKEDIN_CONVERSIONS_API_VERSION` (defaults to `202606`)
- `LINKEDIN_CONVERSIONS_API_ENDPOINT` (optional; defaults to LinkedIn's REST conversion events endpoint)
- `LINKEDIN_CONVERSION_URN_BOOK_CALL`
- `LINKEDIN_CONVERSION_URN_LEAD_SUBMIT`
- `LINKEDIN_CONVERSION_URN_SIGNUP_COMPLETE`
- `META_CONVERSIONS_API_ACCESS_TOKEN`
- `META_CONVERSIONS_API_GRAPH_VERSION`
- `X_CONVERSIONS_API_ENDPOINT`
- `X_CONVERSIONS_API_BEARER_TOKEN`

LinkedIn Conversions API remains opt-in: the server skips dispatch unless the
access token, event-specific conversion rule URN, and at least one match
identifier such as email, `liFatId`, or client IPv4 address are present.

## Verification Checklist

Local or staging:

- Open GTM Preview and confirm `genfeed_marketing_event` data layer events for `page_view`, `cta_click`, and lower-funnel CTAs after accepting consent.
- Use Meta Pixel Helper to confirm Meta Pixel is absent before consent and receives `PageView`, `Contact`, `Schedule`, `Lead`, or `CompleteRegistration` after consent.
- Use LinkedIn Insight Tag verification to confirm the tag loads only after consent and receives mapped conversion events.
- Use X Pixel Helper to confirm X Pixel is absent before consent and receives mapped events after consent.
- Trigger a booking, lead, or signup success event and confirm the browser event and `/api/marketing/conversions` request share the same `eventId`.
- In LinkedIn Campaign Manager diagnostics, confirm configured server events use the same event ID as browser events and skip when conversion rule URNs or identifiers are absent.
- In Meta Events Manager and X Ads diagnostics, confirm server events dedupe with browser events by the shared event ID.
