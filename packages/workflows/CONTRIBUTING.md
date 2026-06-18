# Contributing Workflows

Thank you for contributing public workflow templates to Genfeed.

## Workflow Guidelines

### Requirements

1. **Valid JSON structure** - Match the workflow JSON shape used in `packages/workflows/workflows`.
2. **Unique slug** - Use kebab-case, for example `my-awesome-workflow`.
3. **Public metadata** - Add matching metadata in `packages/workflows/src/index.ts` and `packages/workflows/metadata/catalog.json`.
4. **Working workflow** - Import and test the workflow in Genfeed before submitting.
5. **Generic template** - Keep the template useful for self-hosted users. Do not encode customer-specific runtime details.

### Workflow Structure

```json
{
  "version": 1,
  "name": "Your Workflow Name",
  "description": "Brief description of what this workflow does",
  "edgeStyle": "smoothstep",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "nodes": [...],
  "edges": [...]
}
```

### Categories

- `image-generation` - Image generation workflows
- `video-generation` - Video generation workflows
- `full-pipeline` - Complete end-to-end workflows

## Public Package Boundary

`@genfeedai/workflows` can include public workflow contracts, generic workflow templates, registry metadata, and generic Comfy-compatible helpers.

Do not add:

- Customer-specific GenfeedAI workflow templates.
- Private model paths, account IDs, organization IDs, brand-specific prompts, or customer assets.
- Managed Fleet provisioning, lifecycle controls, health probes, or runtime secrets.
- Hosted LoRA/customer runtime implementation details.

If a workflow needs ComfyUI, keep it generic: template inputs, public node structure, and self-hosted adapter assumptions are fine. Managed runtime routing and customer model assignment belong outside this public package.

## Submission Process

### 1. Fork the Repository

Fork [genfeedai/genfeed.ai](https://github.com/genfeedai/genfeed.ai) on GitHub.

### 2. Create Your Workflow

1. Create your workflow in Genfeed
2. Export it as JSON using the "Export Workflow" button
3. Save to `packages/workflows/workflows/your-workflow.json`

### 3. Add Registry Entry

Update `packages/workflows/src/index.ts`:

```typescript
export const WORKFLOW_REGISTRY: Record<string, WorkflowMetadata> = {
  // ... existing workflows ...
  'your-workflow': {
    category: 'image-generation',
    defaultModel: 'nano-banana-pro',
    description: 'Description of your workflow',
    icon: '✨',
    inputTypes: ['text'],
    outputTypes: ['image'],
    slug: 'your-workflow',
    tags: ['tag1', 'tag2'],
    tier: 'free',
    title: 'Your Workflow Name',
    version: 1,
  },
};
```

Then update `packages/workflows/metadata/catalog.json` with the same public metadata. The registry tests compare both files.

### 4. Test Your Workflow

1. Import the JSON into Genfeed
2. Verify all nodes connect properly
3. Test execution end-to-end
4. Run `bun test packages/workflows/__tests__/registry.spec.ts`
5. Run `bun run --cwd packages/workflows build`

### 5. Submit a Pull Request

1. Commit your changes with a descriptive message
2. Push to your fork
3. Open a PR to the `master` branch
4. Include:
   - Screenshot of the workflow in Genfeed
   - Brief description of the use case
   - Any special requirements or notes

## Quality Standards

### Do

- Use descriptive node labels
- Set appropriate default values
- Include helpful prompts as defaults
- Organize nodes in a logical flow (left-to-right)
- Keep ComfyUI templates generic and self-hostable
- Keep catalog metadata synchronized with the registry

### Don't

- Include hardcoded API keys or secrets
- Include private model paths or customer-specific LoRA paths
- Include customer names, organization IDs, account IDs, or brand assets
- Use deprecated node types
- Create overly complex workflows (keep it focused)
- Submit duplicate workflows

## Example PR Description

```markdown
## Add Portrait Enhancement Workflow

### Description
This workflow takes a portrait image and enhances it with professional lighting and background removal.

### Workflow Structure
[Image Input] → [Background Remove] → [Image Gen (enhance)] → [Output]

### Use Case
Ideal for users who want to quickly enhance portrait photos for professional use.

### Screenshots
[Include screenshot of workflow]

### Testing
- Tested with various portrait images
- Verified background removal accuracy
- Confirmed enhancement quality
```

## Questions?

Open an issue or reach out on [Discord](https://discord.gg/Qy867n83Z4).

## License

By contributing, you agree that your workflows will be licensed under AGPL-3.0.
