# Architecture

Genfeed.ai is split into a self-hosted Core runtime and managed Cloud services.

- Core is the open-source, single-tenant runtime for local setup, workflow authoring, BYOK execution, server-provider execution, and self-hosted storage.
- Genfeed Cloud owns managed inference credits, hosted workspaces, team collaboration, publishing connectors, billing, quotas, managed scheduling, and cross-workflow analytics.
- Enterprise multi-tenancy belongs under `ee/`.

The V1 execution and account-sync contract is documented in [Core and Cloud Execution Boundaries](./execution-boundaries.md).
