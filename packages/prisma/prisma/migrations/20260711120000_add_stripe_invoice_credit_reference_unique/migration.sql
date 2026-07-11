-- Enforce one credit grant per Stripe subscription invoice (#1398).
--
-- The only prior protection against a duplicate subscription-credit grant
-- was the 24h Redis `stripe:webhook:{event.id}` marker in
-- StripeWebhookController. A Stripe replay of `invoice.paid` past that
-- window (auto-retry runs up to 3 days, or a manual Dashboard resend) — or
-- a fresh event id for the same invoice — was an unguarded double-grant.
--
-- This mirrors the `credit_transactions_stripe_checkout_reference_key`
-- pattern (20260706120000) but is intentionally NOT scoped by `source`:
-- StripeWebhookSupportService#hasSubscriptionInvoiceCreditGrant checks
-- existence by (organizationId, referenceType, referenceId) alone, because a
-- MONTHLY grant writes an ADD row and a YEARLY grant writes a RESET row for
-- the same invoice reference, and either must block a re-grant.
--
-- Partial predicates cannot be represented in schema.prisma, so this lives as
-- raw SQL like the existing live Stripe unique indexes. CONCURRENTLY keeps
-- the hot credit ledger writable while the index builds.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_transactions_stripe_invoice_reference_key"
  ON "credit_transactions" ("organizationId", "referenceType", "referenceId")
  WHERE "isDeleted" = false
    AND "referenceId" IS NOT NULL
    AND "referenceType" IN (
      'stripe-invoice:subscription-grant'
    );
