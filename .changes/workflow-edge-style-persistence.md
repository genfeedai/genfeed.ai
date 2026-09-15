packages: serializers workflows

Workflow API create and update payloads now accept the canonical `edgeStyle`
values (`default`, `smoothstep`, `straight`). The setting is stored in the
immutable workflow version graph and exposed by the workflow serializer.
Existing versions without the setting load as `default`; patches that omit it
preserve the stored style, and clones retain it. No database migration is needed.

Workflow record hydration now applies the existing edge-style migration before
save. Legacy `bezier` and invalid persisted settings normalize to `default`,
while canonical styles and missing-record preference fallback stay intact.
