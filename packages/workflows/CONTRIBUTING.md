# Contributing Workflows

Thank you for your interest in contributing workflow templates to Genfeed!

## Workflow Guidelines

### Requirements

1. **Valid JSON structure** - Must match the `WorkflowFile` interface
2. **Unique ID** - Use kebab-case (e.g., `my-awesome-workflow`)
3. **Descriptive metadata** - Clear name, description, and category
4. **Working workflow** - Test in Genfeed before submitting

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

- `image` - Image generation workflows
- `video` - Video generation workflows
- `full-pipeline` - Complete end-to-end workflows

## Submission Process

### 1. Fork the Repository

Fork [genfeedai/core](https://github.com/genfeedai/core) on GitHub.

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
    id: 'your-workflow',
    name: 'Your Workflow Name',
    description: 'Description of your workflow',
    category: 'image', // or 'video' or 'full-pipeline'
    version: 1,
    tags: ['tag1', 'tag2'],
  },
};
```

### 4. Test Your Workflow

1. Import the JSON into Genfeed
2. Verify all nodes connect properly
3. Test execution end-to-end

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

### Don't

- Include hardcoded API keys or secrets
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
