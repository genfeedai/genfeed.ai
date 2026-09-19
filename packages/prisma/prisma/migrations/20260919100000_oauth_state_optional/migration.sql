-- AlterTable
-- OAuth `state` is optional for PKCE-only clients (#4553); codes issued to a
-- request without `state` persist no hash.
ALTER TABLE "mcp_oauth_auth_codes" ALTER COLUMN "stateHash" DROP NOT NULL;
