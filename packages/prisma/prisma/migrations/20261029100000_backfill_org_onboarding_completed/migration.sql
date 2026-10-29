-- #8477: the classic onboarding wizard only set users.isOnboardingCompleted and
-- never organizations.onboardingCompleted (fixed going forward in #8473). The
-- lifecycle emails read the organization flag, so everyone who finished the
-- wizard between 2026-09-29 and the fix keeps getting the setup reminder and
-- never gets the first-generation nudge.
--
-- Scope: users who completed onboarding on or after 2026-09-29. The flag is set
-- on the organization only when the user belongs to exactly one live
-- organization, so the right organization is unambiguous. Users with several
-- memberships are left alone and counted in the report row below.
-- Idempotent: only rows still at false are written.

WITH completers AS (
    SELECT u."id"
    FROM "users" u
    WHERE u."isOnboardingCompleted" = true
      AND u."isDeleted" = false
      AND u."onboardingCompletedAt" >= TIMESTAMP '2026-09-29 00:00:00'
),
memberships AS (
    SELECT m."userId", m."organizationId"
    FROM "members" m
    JOIN "organizations" o
      ON o."id" = m."organizationId" AND o."isDeleted" = false
    WHERE m."isDeleted" = false
      AND m."userId" IN (SELECT "id" FROM completers)
    GROUP BY m."userId", m."organizationId"
),
single_org AS (
    SELECT "userId", MIN("organizationId") AS "organizationId"
    FROM memberships
    GROUP BY "userId"
    HAVING COUNT(*) = 1
),
updated AS (
    UPDATE "organizations" o
    SET "onboardingCompleted" = true,
        "updatedAt" = CURRENT_TIMESTAMP
    FROM single_org s
    WHERE o."id" = s."organizationId"
      AND o."onboardingCompleted" = false
    RETURNING o."id"
)
INSERT INTO "data_backfills" ("id", "report")
SELECT
    'organization_onboarding_completed_20261029',
    jsonb_build_object(
        'completers', (SELECT COUNT(*) FROM completers),
        'organizationsUpdated', (SELECT COUNT(*) FROM updated),
        'skippedMultiOrganizationUsers',
            (SELECT COUNT(*) FROM (
                SELECT "userId" FROM memberships
                GROUP BY "userId" HAVING COUNT(*) > 1
            ) multi)
    )
ON CONFLICT ("id") DO NOTHING;
