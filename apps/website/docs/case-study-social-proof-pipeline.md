# Case-Study Social-Proof Pipeline

This process turns approved early-customer outcomes into public proof assets:
case-study pages, testimonial cards, pricing proof, and landing-page proof.

## Publish Gate

1. Consent: get written approval for customer name/logo use, quoted language,
   metric wording, and the review window.
2. Metrics: capture baseline plus first 60 days of Genfeed-assisted publishing.
   Required fields are 60-day engagement lift, time saved per week, and channels
   activated.
3. Draft: write the challenge, Genfeed workflow, measured outcome, quote, and
   placement plan using only customer-approved facts.
4. Approval: send the exact page copy, testimonial, metric presentation, and page
   preview for customer approval.
5. Publish: mark the case-study entry as `published`, set
   `approvedForPublicUse` to `true`, and reuse the approved testimonial in the
   website proof slots.

## Data Contract

Case studies live in `apps/website/packages/data/case-studies.data.ts`.

To publish the first customer case study without new component work:

1. Add or replace a `CaseStudy` entry with the approved customer copy.
2. Fill all three metric objects with verified values and evidence notes.
3. Fill the testimonial with approved attribution and metric context.
4. Set the entry `status` to `published`.
5. Set both `approvedForPublicUse` fields to `true`.

The website routes render `/case-studies`, `/case-studies/[slug]`, homepage
proof slots, and pricing-page proof slots from that data.

## Public-Safety Rules

- Do not publish customer names, quotes, logos, or metrics before approval.
- Do not publish internal notes, credentials, or source-system references.
- Do not invent traction claims. Placeholder values must stay visibly marked as
  template content until replaced with verified customer data.
