-- Signup used to start every organization as BUSINESS. A free gmail mailbox is a
-- creator, not a business (new signups now classify by owner email). Rewrite the
-- existing gmail-owned organizations once. Only rows still on BUSINESS move:
-- AGENCY, EXPERT and CREATOR stay as chosen, and `accountType` (what the
-- onboarding brand step writes, and what readers prefer over `category`) only
-- changes when it is exactly BUSINESS. Work domains are untouched.
UPDATE "organizations" AS org
SET "category" = 'CREATOR'::"OrganizationCategory",
    "accountType" = CASE
      WHEN org."accountType" = 'BUSINESS'::"OrganizationCategory"
        THEN 'CREATOR'::"OrganizationCategory"
      ELSE org."accountType"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "users" AS owner
WHERE owner."id" = org."userId"
  AND org."isDeleted" = false
  AND org."category" = 'BUSINESS'::"OrganizationCategory"
  AND COALESCE(org."accountType", org."category") = 'BUSINESS'::"OrganizationCategory"
  AND lower(split_part(owner."email", '@', 2)) IN ('gmail.com', 'googlemail.com');
