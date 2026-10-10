-- Freeze the server-prepared model quote separately from tool arguments and
-- execution results. Existing approvals remain readable; a priced generation
-- without verified quote evidence must obtain fresh consent before dispatch.
ALTER TABLE "mcp_approvals" ADD COLUMN "pricingQuote" JSONB;
