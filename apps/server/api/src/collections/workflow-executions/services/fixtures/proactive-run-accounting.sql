BEGIN;
INSERT INTO users (id,handle,"updatedAt") VALUES ('proactive-user-4961','proactive-user-4961',now()) ON CONFLICT DO NOTHING;
INSERT INTO organizations (id,"userId",label,slug,"updatedAt") VALUES ('proactive-org-4961','proactive-user-4961','Proactive fixture','proactive-org-4961',now()),('proactive-foreign-4961','proactive-user-4961','Foreign fixture','proactive-foreign-4961',now()) ON CONFLICT DO NOTHING;
WITH workflow AS (
INSERT INTO workflows (id,"userId","organizationId","currentVersionId","updatedAt") VALUES ('proactive-workflow-4961','proactive-user-4961','proactive-org-4961','proactive-version-4961',now()) ON CONFLICT (id) DO UPDATE SET "updatedAt"=now() RETURNING id
)
INSERT INTO workflow_versions (id,"workflowId","organizationId","userId",version,graph,"contentHash") SELECT 'proactive-version-4961',id,'proactive-org-4961','proactive-user-4961',1,'{"nodes":[],"edges":[]}'::jsonb,'proactive-fixture-hash' FROM workflow ON CONFLICT DO NOTHING;
INSERT INTO agent_strategies (id,"organizationId","userId",label,"updatedAt") VALUES ('proactive-strategy-4961','proactive-org-4961','proactive-user-4961','Proactive fixture',now()) ON CONFLICT DO NOTHING;
INSERT INTO workflow_executions (id,"workflowId","workflowVersionId","userId","organizationId",status,"startedAt",result,"updatedAt") SELECT 'proactive-run-'||n||'-4961','proactive-workflow-4961','proactive-version-4961','proactive-user-4961','proactive-org-4961','RUNNING',now(),'{"metadata":{"source":"proactive","canonicalId":"agent.turn.execute","strategyId":"proactive-strategy-4961"}}'::jsonb,now() FROM generate_series(1,3) n ON CONFLICT DO NOTHING;
INSERT INTO credit_transactions (id,"organizationId",amount,category,"workflowExecutionId","updatedAt") VALUES
('proactive-debit-1-4961','proactive-org-4961',0.3,'deduct','proactive-run-1-4961',now()),
('proactive-refund-1-4961','proactive-org-4961',0.03,'refund','proactive-run-1-4961',now()),
('proactive-debit-2-4961','proactive-org-4961',0.13,'deduct','proactive-run-2-4961',now()),
('proactive-foreign-debit-4961','proactive-foreign-4961',99,'deduct','proactive-run-1-4961',now()) ON CONFLICT DO NOTHING;
COMMIT;
