import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SaaSNode,
  type WorkflowSaaSNodeType,
  workflowSaaSNodeDefinitions,
  workflowSaaSNodeTypes,
} from './SaaSNode';

describe('workflow SaaS node React Flow mapping', () => {
  it('exports a React Flow component for every implemented workflow-ui SaaS node type', () => {
    const nodeTypesToCheck = Object.keys(
      workflowSaaSNodeDefinitions,
    ) as WorkflowSaaSNodeType[];

    for (const nodeType of nodeTypesToCheck) {
      expect(workflowSaaSNodeTypes[nodeType]).toBe(SaaSNode);
    }
  });

  it('covers the trend inspiration nodes implemented in the engine', () => {
    expect(Object.keys(workflowSaaSNodeDefinitions).sort()).toEqual([
      'trendHashtagInspiration',
      'trendSoundInspiration',
      'trendVideoInspiration',
    ]);
  });

  it('spreads workflow SaaS node types into the package nodeTypes map', () => {
    const indexSource = readFileSync('src/nodes/index.ts', 'utf8');

    expect(indexSource).toContain(
      "import { workflowSaaSNodeTypes } from './saas'",
    );
    expect(indexSource).toContain('...workflowSaaSNodeTypes');
  });
});
