BEGIN;

-- Deploy-time seeding used to persist immutable organization-visible mirrors of
-- system catalog entries. Those mirrors were never executable: their sole node
-- is the removed provenance-only systemWorkflowAction wrapper. The catalog is
-- now installed on demand, so delete only rows whose full immutable seeder
-- provenance is intact and which have never entered either execution path.
CREATE FUNCTION workflow_contains_legacy_system_action(workflow_nodes JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT jsonb_typeof(workflow_nodes) = 'array'
        AND jsonb_path_exists(
            workflow_nodes,
            '$[*] ? (@.type == "systemWorkflowAction")'
        );
$$;

CREATE FUNCTION workflow_is_retired_seeded_system_clone(
    workflow_nodes JSONB,
    workflow_metadata JSONB
)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT COALESCE(
        workflow_contains_legacy_system_action(workflow_nodes)
            AND jsonb_array_length(workflow_nodes) = 1
            AND workflow_nodes->0->>'type' = 'systemWorkflowAction'
            AND workflow_nodes->0->'data'->'config'->>'actionId'
                = workflow_metadata->>'sourceTemplateId'
            AND jsonb_typeof(workflow_metadata) = 'object'
            AND NULLIF(workflow_metadata->>'sourceTemplateId', '') IS NOT NULL
            AND workflow_metadata->>'sourceType' = 'seeded-template'
            AND jsonb_typeof(workflow_metadata->'systemWorkflow') = 'object'
            AND workflow_metadata->'systemWorkflow'->>'canonicalId'
                = workflow_metadata->>'sourceTemplateId'
            AND workflow_metadata->'systemWorkflow'->>'kind' = 'system-workflow'
            AND workflow_metadata->'systemWorkflow'->>'owner' = 'genfeed'
            AND workflow_metadata->'systemWorkflow'->'immutable' = 'true'::jsonb
            AND workflow_metadata->'systemWorkflow'->>'visibility' = 'organization',
        FALSE
    );
$$;

DO $$
BEGIN
    -- Community installs may already have applied the following immutable
    -- workflow cutover from the published v0.1.70 artifact. In that state the
    -- legacy nodes column is gone, so this newly inserted repair is a no-op.
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
            AND table_name = 'workflows'
            AND column_name = 'nodes'
    ) THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "workflows" workflow
        WHERE workflow_contains_legacy_system_action(workflow."nodes")
            AND NOT workflow_is_retired_seeded_system_clone(
                workflow."nodes",
                workflow."metadata"
            )
    ) THEN
        RAISE EXCEPTION
            'Workflows contain legacy systemWorkflowAction nodes without exact retired seeded-system provenance';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "workflows" workflow
        WHERE workflow_is_retired_seeded_system_clone(
            workflow."nodes",
            workflow."metadata"
        )
            AND (
                EXISTS (
                    SELECT 1
                    FROM "workflow_executions" execution
                    WHERE execution."workflowId" = workflow."id"
                )
                OR EXISTS (
                    SELECT 1
                    FROM "batch_workflow_jobs" batch_job
                    WHERE batch_job."workflowId" = workflow."id"
                )
            )
    ) THEN
        RAISE EXCEPTION
            'Retired seeded system workflows have execution history and cannot be removed automatically';
    END IF;

    DELETE FROM "workflows" workflow
    WHERE workflow_is_retired_seeded_system_clone(
        workflow."nodes",
        workflow."metadata"
    );
END;
$$;

DROP FUNCTION workflow_is_retired_seeded_system_clone(JSONB, JSONB);
DROP FUNCTION workflow_contains_legacy_system_action(JSONB);

COMMIT;
