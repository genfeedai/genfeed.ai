-- One organization owns exactly one billing identity (#2762 follow-up).
--
-- The checkout controller used to read the derived `stripeCustomerId`
-- projection off the subscription row, conclude "no Stripe customer", and mint
-- a second Stripe customer for an org that already had one. The code fix makes
-- the org's `customers` row authoritative; this migration makes the invariant
-- structural and repairs any rows the bug left behind.
--
-- 1) Dedupe active `customers` rows per organization: keep the row that live
--    subscriptions reference (else the newest), soft-delete the rest.
-- 2) Dedupe active `subscriptions` rows per organization: keep the row bound
--    to a Stripe subscription (else the newest), soft-delete the rest.
-- 3) Enforce both invariants with partial unique indexes. Partial predicates
--    cannot be represented in schema.prisma — same pattern as
--    20260804231500_canonicalize_model_registry.
-- 4) Clear org-billing Stripe customer ids that leaked onto `users` rows: the
--    managed-checkout webhook used to write the org-funding session customer
--    into users."stripeCustomerId", which is the consumer-lane (user-level
--    billing) slot. A user with several orgs would have that single slot
--    clobbered on each managed checkout, and the user-level billing portal
--    would open an org customer. The consumer flow lazily re-creates a proper
--    `type: 'user'` customer on next use.

WITH ranked_customers AS (
  SELECT
    c."id",
    ROW_NUMBER() OVER (
      PARTITION BY c."organizationId"
      ORDER BY
        (EXISTS (
          SELECT 1
          FROM "subscriptions" s
          WHERE s."customerId" = c."id" AND s."isDeleted" = false
        )) DESC,
        c."updatedAt" DESC,
        c."id" DESC
    ) AS rank
  FROM "customers" c
  WHERE c."isDeleted" = false
)
UPDATE "customers"
SET "isDeleted" = true, "updatedAt" = now()
FROM ranked_customers
WHERE "customers"."id" = ranked_customers."id" AND ranked_customers.rank > 1;

CREATE UNIQUE INDEX "customers_organizationId_active_key"
ON "customers"("organizationId")
WHERE "isDeleted" = false;

WITH ranked_subscriptions AS (
  SELECT
    s."id",
    ROW_NUMBER() OVER (
      PARTITION BY s."organizationId"
      ORDER BY
        (s."stripeSubscriptionId" IS NOT NULL) DESC,
        s."updatedAt" DESC,
        s."id" DESC
    ) AS rank
  FROM "subscriptions" s
  WHERE s."isDeleted" = false
)
UPDATE "subscriptions"
SET "isDeleted" = true, "updatedAt" = now()
FROM ranked_subscriptions
WHERE "subscriptions"."id" = ranked_subscriptions."id"
  AND ranked_subscriptions.rank > 1;

CREATE UNIQUE INDEX "subscriptions_organizationId_active_key"
ON "subscriptions"("organizationId")
WHERE "isDeleted" = false;

UPDATE "users"
SET "stripeCustomerId" = NULL
WHERE "stripeCustomerId" IS NOT NULL
  AND "stripeCustomerId" IN (
    SELECT "stripeCustomerId"
    FROM "customers"
    WHERE "stripeCustomerId" IS NOT NULL
  );
