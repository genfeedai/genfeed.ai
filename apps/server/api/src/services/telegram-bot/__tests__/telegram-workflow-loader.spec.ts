import type { WorkflowJson } from '@api/services/telegram-bot/telegram-bot.types';
import {
  extractWorkflowInputs,
  toExecutableWorkflow,
} from '@api/services/telegram-bot/telegram-workflow-loader';
import { describe, expect, it } from 'vitest';

const workflow: WorkflowJson = {
  description: 'desc',
  edges: [
    {
      id: 'e1',
      source: 'img',
      sourceHandle: 'out',
      target: 'gen',
      targetHandle: 'in',
    },
  ],
  name: 'Test Workflow',
  nodes: [
    { data: { label: 'My Image' }, id: 'img', type: 'imageInput' },
    { data: {}, id: 'tg', type: 'telegramInput' },
    { data: { prompt: 'default text' }, id: 'p', type: 'prompt' },
    { data: {}, id: 'a', type: 'audioInput' },
    { data: {}, id: 'v', type: 'videoInput' },
    { data: { model: 'x' }, id: 'gen', type: 'imageGen' },
  ],
  version: 1,
};

describe('extractWorkflowInputs', () => {
  it('extracts only input nodes with the correct kinds and labels', () => {
    const inputs = extractWorkflowInputs(workflow);

    expect(inputs.map((i) => i.nodeId)).toEqual(['img', 'tg', 'p', 'a', 'v']);

    const byId = Object.fromEntries(inputs.map((i) => [i.nodeId, i]));
    expect(byId.img).toMatchObject({
      inputType: 'image',
      label: 'My Image',
      required: true,
    });
    expect(byId.tg).toMatchObject({ inputType: 'image', label: 'Image' });
    expect(byId.p).toMatchObject({
      defaultValue: 'default text',
      inputType: 'text',
      label: 'Prompt',
    });
    expect(byId.a).toMatchObject({ inputType: 'audio', label: 'Audio' });
    expect(byId.v).toMatchObject({ inputType: 'video', label: 'Video' });
    // Only the prompt (text) input carries a default value.
    expect(byId.img.defaultValue).toBeUndefined();
  });
});

describe('toExecutableWorkflow', () => {
  it('injects collected inputs into the matching config field', () => {
    const collected = new Map<string, string>([
      ['img', 'url1'],
      ['p', 'typed prompt'],
      ['a', 'audio-url'],
      ['v', 'video-url'],
    ]);

    const executable = toExecutableWorkflow(workflow, collected, 'wid');
    const byId = Object.fromEntries(executable.nodes.map((n) => [n.id, n]));

    expect(byId.img.config.image).toBe('url1');
    expect(byId.p.config.prompt).toBe('typed prompt');
    expect(byId.a.config.audio).toBe('audio-url');
    expect(byId.v.config.video).toBe('video-url');
    // Uncollected nodes keep their original config untouched.
    expect(byId.tg.config.image).toBeUndefined();
    expect(byId.gen.config.model).toBe('x');
    // Edge wiring is preserved as node input ids.
    expect(byId.gen.inputs).toEqual(['img']);
    expect(executable.id).toBe('wid');
    expect(executable.organizationId).toBe('telegram-bot');
  });
});
