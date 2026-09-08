packages: actions agent props serializers

Add the Agent request_input, present_work_object, and ingest_source_media tool
contracts. Work-object presentation persists Library content and therefore uses
an explicit direct mutation policy. Input requests require one to five choices.

The Agent package adds work-object editors, review gating, thread state and API
methods for durable input decisions and Library drafts. Shared props define the
new input-request overlay and work-object components. Library serializers expose
sanitized canonical work-object content rather than internal metadata.

Consumers embedding Agent UI should pass the new input-request and work-object
props and keep client packages aligned with the server endpoints. Existing
conversations and Library assets without work-object metadata retain their
current representation. Hosts must preserve the distinction between a pending
review and a completed review before enabling generation.
