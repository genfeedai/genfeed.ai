# Website Marketing Tracking

The website owns one canonical marketing event layer in
`apps/website/packages/marketing`.

## Event Contract

Browser marketing events:

- `page_view`
- `view_pricing`
- `cta_click`
- `start_signup`
- `book_call`
- `lead_submit`
- `signup_complete`

`book_call`, `lead_submit`, and `signup_complete` also carry a shared
`eventId` to the same-site conversion endpoint when the browser has granted
marketing consent.

`ButtonTracked` keeps the existing Vercel Analytics event and also emits a
`genfeed:marketing:button-click` browser event. The website provider maps CTA
actions such as `book_demo`, `view_plans`, and `core_cta` onto the canonical
event names.

## Consent

`NEXT_PUBLIC_MARKETING_CONSENT_DEFAULT=denied` is the default. Marketing event
dispatch fails closed while consent is unavailable or denied. Consented events
are pushed to `window.dataLayer` as `genfeed_marketing_event`; vendor pixels are
configured in GTM or server-side conversion configuration, not in page
components.

Consent is stored in `localStorage` under `genfeed:marketing-consent` using
this contract:

```json
{
  "adStorage": "granted",
  "analyticsStorage": "granted",
  "updatedAt": "2026-06-30T00:00:00.000Z"
}
```

`adStorage` must be `granted` before any marketing event reaches
GTM/dataLayer.

## Environment

Public browser config:

- `NEXT_PUBLIC_MARKETING_CONSENT_DEFAULT`
- `NEXT_PUBLIC_GTM_CONTAINER_ID`

Server conversion config:

- `LINKEDIN_CONVERSIONS_API_ACCESS_TOKEN`
- `LINKEDIN_CONVERSIONS_API_VERSION` (defaults to `202606`)
- `LINKEDIN_CONVERSIONS_API_ENDPOINT` (optional; defaults to LinkedIn's REST
  conversion events endpoint)
- `LINKEDIN_CONVERSION_URN_BOOK_CALL`
- `LINKEDIN_CONVERSION_URN_LEAD_SUBMIT`
- `LINKEDIN_CONVERSION_URN_SIGNUP_COMPLETE`
- `META_CONVERSIONS_API_ACCESS_TOKEN`
- `META_CONVERSIONS_API_GRAPH_VERSION`
- `META_PIXEL_ID`
- `X_CONVERSIONS_API_ENDPOINT`
- `X_CONVERSIONS_API_BEARER_TOKEN`
- `X_BOOK_CALL_EVENT_ID`
- `X_CTA_CLICK_EVENT_ID`
- `X_LEAD_SUBMIT_EVENT_ID`
- `X_SIGNUP_COMPLETE_EVENT_ID`
- `X_START_SIGNUP_EVENT_ID`
- `X_VIEW_PRICING_EVENT_ID`

LinkedIn Conversions API remains opt-in: the server skips dispatch unless the
access token, event-specific conversion rule URN, and at least one match
identifier such as email, `liFatId`, or client IPv4 address are present.

## Verification Checklist

Local or staging:

- Open GTM Preview and confirm no `genfeed_marketing_event` dataLayer events
  are emitted before accepting marketing consent.
- Accept marketing consent and confirm `genfeed_marketing_event` dataLayer
  events for `page_view`, `cta_click`, and lower-funnel CTAs.
- Confirm Meta, LinkedIn, X, or other vendor browser pixels are configured in
  GTM rather than in website page components.
- Trigger a booking, lead, or signup success event and confirm the dataLayer
  event and `/api/marketing/conversions` request share the same `eventId`.
