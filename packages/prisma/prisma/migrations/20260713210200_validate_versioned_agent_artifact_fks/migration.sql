-- New writes have been enforced since the NOT VALID constraint landed.
-- Validation permits normal reads and writes while scanning existing rows.

ALTER TABLE "posts"
VALIDATE CONSTRAINT "posts_reviewVersionPinId_organizationId_fkey";

ALTER TABLE "content_drafts"
VALIDATE CONSTRAINT "content_drafts_approvedVersionPinId_organizationId_fkey";

ALTER TABLE "newsletters"
VALIDATE CONSTRAINT "newsletters_approvedVersionPinId_organizationId_fkey";
