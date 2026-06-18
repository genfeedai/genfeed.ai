# @genfeedai/workflows

Public Genfeed workflow templates, registry metadata, execution contracts, and generic Comfy-compatible helpers.

## Install

```bash
npm i @genfeedai/workflows
```

## Usage

```ts
import { WORKFLOW_REGISTRY, getWorkflowMetadata } from '@genfeedai/workflows';

const meta = getWorkflowMetadata('single-image');
console.log(meta?.title, WORKFLOW_REGISTRY['single-image']?.slug);
```

Workflow JSON templates are exported from `@genfeedai/workflows/workflows/*`.

Generic ComfyUI helpers are available from the explicit subpath:

```ts
import { ComfyUITemplateRunner } from '@genfeedai/workflows/comfyui';
```

## Package Boundary

This package is public open-source surface area. It includes:

- Workflow JSON templates that are generic enough for self-hosted users.
- Registry metadata for public workflow templates.
- Execution contracts and provider-agnostic workflow generation helpers.
- Generic Comfy-compatible template and prompt helpers.

It does not include:

- Customer-specific GenfeedAI workflow templates.
- Managed model inventory, model assignment, or account entitlement logic.
- Fleet provisioning, health probes, lifecycle controls, secrets, or private model paths.
- Hosted LoRA/customer runtime operations.

Self-hosted users can connect their own ComfyUI or provider infrastructure. Managed Genfeed Cloud runtime operations are exposed only through explicit Cloud APIs and are outside this public package.

## Related Packages

- `@genfeedai/types`
- `@genfeedai/prompts`

## Build Faster with Genfeed

Use production-ready templates in code, or run them in Genfeed at [https://genfeed.ai](https://genfeed.ai).

## License

AGPL-3.0
