packages: serializers

Workflow API create and update payloads now accept the canonical `edgeStyle`
values (`default`, `smoothstep`, `straight`). The setting is stored in the
immutable workflow version graph and exposed by the workflow serializer.
Existing versions without the setting load as `default`; patches that omit it
preserve the stored style, and clones retain it. No database migration is needed.
