-- Enforce one active credit grant per Stripe checkout session and grant kind.
-- The credit side effect is durable in Postgres; Redis checkout processed
-- markers remain a best-effort fast path only.
--
-- Partial predicates cannot be represented in schema.prisma, so this lives as
-- raw SQL like the existing live Stripe customer/subscription unique indexes.
-- CONCURRENTLY keeps the hot credit ledger writable while the index builds.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_transactions_stripe_checkout_reference_key"
  ON "credit_transactions" ("organizationId", "source", "referenceType", "referenceId")
  WHERE "isDeleted" = false
    AND "referenceId" IS NOT NULL
    AND "referenceType" IN (
      'stripe-checkout-session:organization-payment',
      'stripe-checkout-session:managed-inference',
      'stripe-checkout-session:user-credit'
    );
