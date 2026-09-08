import { describe, expect, it } from 'vitest';
import {
  isCompatibleWorkflowHandle,
  resolveWorkflowNodeDefinition,
} from './workflowNodeHandles';

describe('workflow node handles', () => {
  it('keeps raw core node ports distinct from catalog actions with the same identity', () => {
    const core = resolveWorkflowNodeDefinition('imageGen');
    const action = resolveWorkflowNodeDefinition('genfeedAction', {
      actionId: 'imageGen',
    });
    expect(core?.inputs.map((handle) => handle.id)).toEqual([
      'prompt',
      'images',
    ]);
    expect(core?.outputs.map((handle) => handle.id)).toEqual(['image']);
    expect(action?.inputs.map((handle) => handle.id)).toContain('model');
    expect(action?.outputs.map((handle) => handle.id)).toContain('imageUrl');
  });

  it('uses action identity over the generic visual override', () => {
    const definition = resolveWorkflowNodeDefinition(
      'genfeedAction',
      {
        actionId: 'remotion.composition.status',
      },
      {
        category: 'automation',
        icon: 'Workflow',
        inputs: [{ id: 'input', label: 'Input', type: 'any' }],
        outputs: [{ id: 'output', label: 'Output', type: 'any' }],
      },
    );
    expect(definition?.inputs.map((handle) => handle.id)).toEqual([
      'projectId',
    ]);
    expect(definition?.outputs.map((handle) => handle.id)).toContain(
      'progress',
    );
  });

  it('preserves custom presentation definitions when no action is selected', () => {
    const override = {
      category: 'input',
      icon: 'Image',
      inputs: [],
      outputs: [{ id: 'photo', label: 'Photo', type: 'image' }],
    };
    expect(resolveWorkflowNodeDefinition('custom', {}, override)).toBe(
      override,
    );
    expect(resolveWorkflowNodeDefinition('unknown')).toBeUndefined();
  });

  it('supports declared generic SaaS ports while rejecting unknown and incompatible types', () => {
    expect(isCompatibleWorkflowHandle('text', 'any')).toBe(true);
    expect(isCompatibleWorkflowHandle('any', 'object')).toBe(true);
    expect(isCompatibleWorkflowHandle('brand', 'brand')).toBe(true);
    expect(isCompatibleWorkflowHandle('number', 'text')).toBe(false);
    expect(isCompatibleWorkflowHandle('unknown', 'any')).toBe(false);
    expect(isCompatibleWorkflowHandle('any', 'unknown')).toBe(false);
  });
});
