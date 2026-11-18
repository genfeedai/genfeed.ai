-- Record where an MCP approval was decided (#9647): the review inbox (`ui`)
-- or an in-conversation answer in an MCP client (`mcp`), and by whom.
ALTER TABLE "mcp_approvals" ADD COLUMN "resolvedOrigin" TEXT;
ALTER TABLE "mcp_approvals" ADD COLUMN "resolvedByUserId" TEXT;
