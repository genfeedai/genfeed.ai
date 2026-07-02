-- #754: index the webhook trigger lookup.
--
-- `WorkflowWebhookService.findByWebhookId` resolves the public webhook trigger
-- endpoint by `config->>'webhookId'`. The previous implementation loaded every
-- non-deleted workflow and scanned in JS; the service now filters in SQL, and
-- this partial expression index makes that filter a direct index lookup
-- instead of a sequential scan that degrades linearly with workflow count.
--
-- The expression matches the service query exactly:
--   WHERE "isDeleted" = false AND config->>'webhookId' = $1
--
-- CONCURRENTLY avoids ACCESS EXCLUSIVE locks on the workflows table during
-- deploy (same approach as trend_source_refs rank indexes).

CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflows_config_webhook_id_idx"
ON "workflows" ((config->>'webhookId'))
WHERE "isDeleted" = false;
