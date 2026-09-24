-- Retain security attribution. Invalid existing references abort the entire migration.
BEGIN;

CREATE UNIQUE INDEX "post_groups_id_organizationId_key" ON "post_groups"("id", "organizationId");
CREATE UNIQUE INDEX "workflow_executions_id_organizationId_key" ON "workflow_executions"("id", "organizationId");

ALTER TABLE "agent_publish_audits" DROP CONSTRAINT "agent_publish_audits_userId_fkey";
ALTER TABLE "agent_publish_audits" ADD CONSTRAINT "agent_publish_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "agent_publish_audits" DROP CONSTRAINT "agent_publish_audits_organizationId_fkey";
ALTER TABLE "agent_publish_audits" ADD CONSTRAINT "agent_publish_audits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "agent_publish_audits" DROP CONSTRAINT "agent_publish_audits_brandId_fkey";
ALTER TABLE "agent_publish_audits" ADD CONSTRAINT "agent_publish_audits_brandId_fkey" FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "agent_publish_audits" DROP CONSTRAINT "agent_publish_audits_workflowExecutionId_fkey";
ALTER TABLE "agent_publish_audits" ADD CONSTRAINT "agent_publish_audits_workflowExecutionId_fkey" FOREIGN KEY ("workflowExecutionId", "organizationId") REFERENCES "workflow_executions"("id", "organizationId") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "agent_publish_audits" DROP CONSTRAINT "agent_publish_audits_postGroupId_fkey";
ALTER TABLE "agent_publish_audits" ADD CONSTRAINT "agent_publish_audits_postGroupId_fkey" FOREIGN KEY ("postGroupId", "organizationId") REFERENCES "post_groups"("id", "organizationId") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "agent_untrusted_content_audits" DROP CONSTRAINT "agent_untrusted_content_audits_userId_fkey";
ALTER TABLE "agent_untrusted_content_audits" ADD CONSTRAINT "agent_untrusted_content_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "agent_untrusted_content_audits" DROP CONSTRAINT "agent_untrusted_content_audits_organizationId_fkey";
ALTER TABLE "agent_untrusted_content_audits" ADD CONSTRAINT "agent_untrusted_content_audits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "agent_untrusted_content_audits" DROP CONSTRAINT "agent_untrusted_content_audits_brandId_fkey";
ALTER TABLE "agent_untrusted_content_audits" ADD CONSTRAINT "agent_untrusted_content_audits_brandId_fkey" FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "agent_untrusted_content_audits" DROP CONSTRAINT "agent_untrusted_content_audits_workflowExecutionId_fkey";
ALTER TABLE "agent_untrusted_content_audits" ADD CONSTRAINT "agent_untrusted_content_audits_workflowExecutionId_fkey" FOREIGN KEY ("workflowExecutionId", "organizationId") REFERENCES "workflow_executions"("id", "organizationId") ON DELETE RESTRICT ON UPDATE NO ACTION;

COMMIT;
