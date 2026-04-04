import { getNodeDefinition } from '@api/collections/workflows/registry/node-registry-adapter';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { describe, expect, it } from 'vitest';

describe('workflow template node coverage', () => {
  it('exposes a registry definition for every visual template node type', () => {
    const templateNodeTypes = new Set(
      Object.values(WORKFLOW_TEMPLATES)
        .flatMap((template) => template.nodes ?? [])
        .map((node) => node.type),
    );

    for (const nodeType of templateNodeTypes) {
      expect(getNodeDefinition(nodeType)).toBeDefined();
    }
  });
});
