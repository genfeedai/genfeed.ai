import { beforeEach, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import type { ExecutorInput } from '../base-executor';
import { CastPromptExecutor } from './cast-prompt-executor';

function makeNode(
  configOverrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config: {
      action: 'creator talking to camera',
      cameraMovement: 'static',
      colorPalette: 'natural indoor color',
      family: 'ugc',
      hasStartFrameReference: false,
      lighting: 'window light',
      mood: 'casual, direct',
      presetId: 'ugc_selfie_handheld',
      subject: 'young creator in a bedroom',
      ...configOverrides,
    },
    id: 'cast-1',
    inputs: [],
    label: 'CAST Prompt',
    type: 'castPrompt',
  };
}

function makeInput(
  configOverrides: Record<string, unknown> = {},
  inputEntries: [string, unknown][] = [],
): ExecutorInput {
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return {
    context,
    inputs: new Map<string, unknown>(inputEntries),
    node: makeNode(configOverrides),
  };
}

describe('CastPromptExecutor', () => {
  let executor: CastPromptExecutor;

  beforeEach(() => {
    executor = new CastPromptExecutor();
  });

  it('emits a UGC compiled prompt that contains the vocabulary library blocks', async () => {
    const result = await executor.execute(makeInput());
    const data = result.data as { prompt: string; text: string };

    expect(data.prompt).toBe(data.text);
    expect(data.prompt).toMatch(/eyebrow raise/i);
    expect(data.prompt).toMatch(/handheld selfie sway/i);
    expect(data.prompt).toMatch(/facial proportions/i);
    expect(data.prompt).not.toMatch(/anamorphic/i);
  });

  it('ties identity lock to a connected start frame', async () => {
    const result = await executor.execute(
      makeInput({ hasStartFrameReference: false }, [
        ['startFrame', 'https://cdn.example.com/ref.jpg'],
      ]),
    );
    const data = result.data as { prompt: string };

    expect(data.prompt).toMatch(/start-frame reference/i);
  });

  it('rejects a missing preset', () => {
    const validation = executor.validate(makeNode({ presetId: '' }));
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toMatch(/preset/i);
  });
});
