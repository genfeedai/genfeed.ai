-- Workflow identity stays mutable; executable definitions become immutable.
CREATE TABLE "workflow_versions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "inputSchema" JSONB NOT NULL DEFAULT '[]',
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_versions_workflowId_version_key"
    ON "workflow_versions"("workflowId", "version");
CREATE INDEX "workflow_versions_organizationId_workflowId_version_idx"
    ON "workflow_versions"("organizationId", "workflowId", "version" DESC);

ALTER TABLE "workflow_versions"
    ADD CONSTRAINT "workflow_versions_workflowId_fkey"
    FOREIGN KEY ("workflowId") REFERENCES "workflows"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_versions"
    ADD CONSTRAINT "workflow_versions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_versions"
    ADD CONSTRAINT "workflow_versions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only trigger/input/control nodes remain engine-native. Every product node is
-- rewritten to the single action-backed node shape during the hard cut.
CREATE FUNCTION workflow_node_is_engine_native(node_type TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT
        node_type LIKE 'trigger-%'
        OR node_type IN (
            'commentTrigger',
            'condition',
            'control-branch',
            'control-delay',
            'control-loop',
            'delay',
            'engagementTrigger',
            'input-image',
            'input-video',
            'keywordTrigger',
            'mentionTrigger',
            'newFollowerTrigger',
            'newLikeTrigger',
            'newRepostTrigger',
            'postPublishTrigger',
            'reviewGate',
            'workflowInput'
        );
$$;

CREATE FUNCTION workflow_node_action_id(node_type TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE node_type
        WHEN 'ai-avatar-video' THEN 'aiAvatarVideo'
        WHEN 'ai-generate-image' THEN 'imageGen'
        WHEN 'ai-generate-newsletter' THEN 'newsletterGen'
        WHEN 'ai-generate-post' THEN 'postGen'
        WHEN 'ai-generate-video' THEN 'videoGen'
        WHEN 'ai-lip-sync' THEN 'lipSync'
        WHEN 'ai-llm' THEN 'llm'
        WHEN 'ai-prompt-constructor' THEN 'promptConstructor'
        WHEN 'ai-reframe' THEN 'reframe'
        WHEN 'ai-text-to-speech' THEN 'textToSpeech'
        WHEN 'ai-upscale' THEN 'upscale'
        WHEN 'ai-voice-change' THEN 'voiceChange'
        WHEN 'analytics-feedback' THEN 'analyticsFeedback'
        WHEN 'attach-post-ingredient' THEN 'attachPostIngredient'
        WHEN 'cast-prompt-generator' THEN 'castPrompt'
        WHEN 'effect-color-grade' THEN 'colorGrade'
        WHEN 'input-prompt' THEN 'prompt'
        WHEN 'generateVideo' THEN 'videoGen'
        WHEN 'output-publish' THEN 'publish'
        WHEN 'social-post-reply' THEN 'postReply'
        WHEN 'social-send-dm' THEN 'sendDm'
        WHEN 'source-corpus' THEN 'sourceCorpus'
        WHEN 'workflow-output' THEN 'workflow.collect-output'
        WHEN 'workflow_output' THEN 'workflow.collect-output'
        WHEN 'workflowOutput' THEN 'workflow.collect-output'
        ELSE node_type
    END;
$$;

CREATE FUNCTION workflow_action_node(source_node JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL
IMMUTABLE
AS $$
DECLARE
    node_type TEXT := source_node->>'type';
    action_id TEXT;
    node_data JSONB := COALESCE(source_node->'data', '{}'::jsonb);
    parameters JSONB := COALESCE(
        source_node->'data'->'config',
        source_node->'config',
        '{}'::jsonb
    );
BEGIN
    IF node_type IS NULL OR node_type = '' THEN
        RAISE EXCEPTION 'Workflow node % has no type', source_node->>'id';
    END IF;

    IF node_type = 'workflow-input' THEN
        RETURN jsonb_set(
            source_node,
            '{type}',
            to_jsonb('workflowInput'::text),
            true
        );
    END IF;

    IF workflow_node_is_engine_native(node_type) THEN
        RETURN source_node;
    END IF;

    IF node_type = 'genfeedAction' THEN
        action_id := workflow_node_action_id(
            source_node->'data'->'config'->>'actionId'
        );
        parameters := COALESCE(
            source_node->'data'->'config'->'parameters',
            '{}'::jsonb
        );
    ELSE
        action_id := workflow_node_action_id(node_type);
    END IF;

    IF action_id IS NULL OR action_id = '' THEN
        RAISE EXCEPTION 'Workflow action node % has no actionId', source_node->>'id';
    END IF;

    RETURN jsonb_set(
        jsonb_set(source_node, '{type}', to_jsonb('genfeedAction'::text), true),
        '{data}',
        node_data || jsonb_build_object(
            'config',
            jsonb_build_object(
                'actionId', action_id,
                'parameters', parameters
            )
        ),
        true
    ) - 'config';
END;
$$;

CREATE FUNCTION workflow_step_action_id(category TEXT)
RETURNS TEXT
LANGUAGE PLPGSQL
IMMUTABLE
AS $$
BEGIN
    RETURN CASE category
        WHEN 'transform' THEN 'process-transform'
        WHEN 'upscale' THEN 'upscale'
        WHEN 'resize' THEN 'process-resize'
        WHEN 'caption' THEN 'effect-captions'
        WHEN 'clip' THEN 'generate_clips'
        WHEN 'publish' THEN 'publish'
        WHEN 'webhook' THEN 'output-webhook'
        WHEN 'generate-image' THEN 'imageGen'
        WHEN 'generate-video' THEN 'videoGen'
        WHEN 'generate-article' THEN 'create_article'
        WHEN 'color-grade' THEN 'colorGrade'
        WHEN 'generate-hook' THEN 'hookGenerator'
        WHEN 'text-overlay' THEN 'effect-text-overlay'
        WHEN 'image-batch' THEN 'generate_content_batch'
        WHEN 'performance-track' THEN 'analyticsFeedback'
        ELSE NULL
    END;
END;
$$;

DO $$
DECLARE
    workflow_row RECORD;
    source_nodes JSONB;
    migrated_nodes JSONB;
    migrated_edges JSONB;
    graph_document JSONB;
    step_record RECORD;
    dependency TEXT;
    step_id TEXT;
    action_id TEXT;
BEGIN
    FOR workflow_row IN
        SELECT * FROM "workflows" ORDER BY "createdAt", "id"
    LOOP
        source_nodes := COALESCE(workflow_row."nodes", '[]'::jsonb);

        IF jsonb_array_length(source_nodes) > 0 THEN
            SELECT COALESCE(jsonb_agg(workflow_action_node(node)), '[]'::jsonb)
            INTO migrated_nodes
            FROM jsonb_array_elements(source_nodes) AS node;

            migrated_edges := COALESCE(workflow_row."edges", '[]'::jsonb);
        ELSE
            migrated_nodes := '[]'::jsonb;
            migrated_edges := '[]'::jsonb;

            FOR step_record IN
                SELECT value, ordinality
                FROM jsonb_array_elements(COALESCE(workflow_row."steps", '[]'::jsonb))
                    WITH ORDINALITY
            LOOP
                step_id := COALESCE(
                    NULLIF(step_record.value->>'id', ''),
                    'step-' || step_record.ordinality::text
                );

                IF step_record.value->>'category' = 'delay' THEN
                    migrated_nodes := migrated_nodes || jsonb_build_array(
                        jsonb_build_object(
                            'id', step_id,
                            'type', 'control-delay',
                            'position', jsonb_build_object(
                                'x', (step_record.ordinality - 1) * 280,
                                'y', 0
                            ),
                            'data', jsonb_build_object(
                                'label', COALESCE(step_record.value->>'label', 'Delay'),
                                'config', COALESCE(step_record.value->'config', '{}'::jsonb)
                            )
                        )
                    );
                ELSE
                    action_id := workflow_step_action_id(step_record.value->>'category');
                    IF action_id IS NULL THEN
                        RAISE EXCEPTION
                            'Workflow % step % has unconvertible category %',
                            workflow_row."id",
                            step_id,
                            step_record.value->>'category';
                    END IF;

                    migrated_nodes := migrated_nodes || jsonb_build_array(
                        jsonb_build_object(
                            'id', step_id,
                            'type', 'genfeedAction',
                            'position', jsonb_build_object(
                                'x', (step_record.ordinality - 1) * 280,
                                'y', 0
                            ),
                            'data', jsonb_build_object(
                                'label', COALESCE(step_record.value->>'label', action_id),
                                'config', jsonb_build_object(
                                    'actionId', action_id,
                                    'parameters', COALESCE(step_record.value->'config', '{}'::jsonb)
                                )
                            )
                        )
                    );
                END IF;

                FOR dependency IN
                    SELECT jsonb_array_elements_text(
                        COALESCE(step_record.value->'dependsOn', '[]'::jsonb)
                    )
                LOOP
                    migrated_edges := migrated_edges || jsonb_build_array(
                        jsonb_build_object(
                            'id', dependency || '-' || step_id,
                            'source', dependency,
                            'target', step_id
                        )
                    );
                END LOOP;
            END LOOP;
        END IF;

        graph_document := jsonb_build_object(
            'nodes', migrated_nodes,
            'edges', migrated_edges,
            'lockedNodeIds', COALESCE(workflow_row."lockedNodeIds", '[]'::jsonb)
        );

        INSERT INTO "workflow_versions" (
            "id",
            "workflowId",
            "organizationId",
            "userId",
            "version",
            "graph",
            "inputSchema",
            "contentHash",
            "createdAt"
        ) VALUES (
            'wv_legacy_' || workflow_row."id",
            workflow_row."id",
            workflow_row."organizationId",
            workflow_row."userId",
            1,
            graph_document,
            COALESCE(workflow_row."inputVariables", '[]'::jsonb),
            md5(graph_document::text || ':' || COALESCE(workflow_row."inputVariables", '[]'::jsonb)::text),
            workflow_row."updatedAt"
        );
    END LOOP;
END;
$$;

ALTER TABLE "workflows" ADD COLUMN "currentVersionId" TEXT;
UPDATE "workflows"
SET "currentVersionId" = 'wv_legacy_' || "id";
CREATE UNIQUE INDEX "workflows_currentVersionId_key"
    ON "workflows"("currentVersionId");
ALTER TABLE "workflows"
    ADD CONSTRAINT "workflows_currentVersionId_fkey"
    FOREIGN KEY ("currentVersionId") REFERENCES "workflow_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_executions" ADD COLUMN "workflowVersionId" TEXT;
UPDATE "workflow_executions" execution
SET "workflowVersionId" = workflow."currentVersionId"
FROM "workflows" workflow
WHERE execution."workflowId" = workflow."id";
ALTER TABLE "workflow_executions" ALTER COLUMN "workflowVersionId" SET NOT NULL;
CREATE INDEX "workflow_executions_organizationId_workflowVersionId_createdAt_idx"
    ON "workflow_executions"("organizationId", "workflowVersionId", "createdAt" DESC);
ALTER TABLE "workflow_executions"
    ADD CONSTRAINT "workflow_executions_workflowVersionId_fkey"
    FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflows"
    DROP COLUMN "steps",
    DROP COLUMN "nodes",
    DROP COLUMN "edges",
    DROP COLUMN "inputVariables",
    DROP COLUMN "lockedNodeIds";

DROP FUNCTION workflow_step_action_id(TEXT);
DROP FUNCTION workflow_action_node(JSONB);
DROP FUNCTION workflow_node_action_id(TEXT);
DROP FUNCTION workflow_node_is_engine_native(TEXT);
