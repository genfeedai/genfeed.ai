-- Converge customer.subscription.created and the initial invoice.paid event on
-- one durable credit grant per Stripe subscription (#1608). Later billing
-- cycles remain protected by the invoice-reference index added for #1398.
--
-- Partial predicates cannot be represented in schema.prisma. CONCURRENTLY
-- keeps the hot credit ledger writable while the index builds.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_transactions_stripe_subscription_initial_reference_key"
  ON "credit_transactions" ("organizationId", "referenceType", "referenceId")
  WHERE "isDeleted" = false
    AND "referenceId" IS NOT NULL
    AND "referenceType" = 'stripe-subscription:initial-grant';
