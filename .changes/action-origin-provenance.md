packages: @genfeedai/contracts @genfeedai/contracts/interfaces @genfeedai/contracts/queue @genfeedai/serializers

Add a canonical action-origin taxonomy and expose trusted origin, actor, and
API-key references on activity records. Queue contracts now retain the
non-secret initiating action context across agent and publish retries so MCP,
API, CLI, workflow, agent, and UI provenance remains queryable end to end.
